"""Core scanning engine."""

from __future__ import annotations

import hashlib
import io
import os
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Iterator

from . import heuristics
from .signatures import SignatureDB

DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
DEFAULT_HEURISTIC_THRESHOLD = 50
MAX_ARCHIVE_MEMBER_SIZE = 20 * 1024 * 1024
MAX_ARCHIVE_DEPTH = 2
SKIP_DIRS = {"/proc", "/sys", "/dev", "/run"}
# The engine's own rules contain the very strings it hunts for; never scan them.
PACKAGE_DIR = Path(__file__).resolve().parent


@dataclass
class Detection:
    threat: str
    method: str  # "hash", "pattern" or "heuristic"
    severity: str = "high"
    details: list[str] = field(default_factory=list)


@dataclass
class ScanResult:
    path: str
    sha256: str | None = None
    size: int = 0
    detections: list[Detection] = field(default_factory=list)
    error: str | None = None
    skipped: str | None = None

    @property
    def infected(self) -> bool:
        return any(d.severity == "high" for d in self.detections)

    @property
    def suspicious(self) -> bool:
        return bool(self.detections) and not self.infected

    @property
    def clean(self) -> bool:
        return not self.detections and self.error is None


class Scanner:
    def __init__(
        self,
        db: SignatureDB | None = None,
        max_file_size: int = DEFAULT_MAX_FILE_SIZE,
        heuristic_threshold: int = DEFAULT_HEURISTIC_THRESHOLD,
        use_heuristics: bool = True,
        scan_archives: bool = True,
        exclude: Iterable[str | Path] = (),
    ):
        self.db = db if db is not None else SignatureDB()
        self.max_file_size = max_file_size
        self.heuristic_threshold = heuristic_threshold
        self.use_heuristics = use_heuristics
        self.scan_archives = scan_archives
        self.exclude = [PACKAGE_DIR, *(Path(p).resolve() for p in exclude)]

    # ------------------------------------------------------------------ public

    def scan_file(self, path: str | Path) -> ScanResult:
        path = Path(path)
        result = ScanResult(path=str(path))
        try:
            if path.is_symlink():
                result.skipped = "symlink"
                return result
            size = path.stat().st_size
            result.size = size
            if size > self.max_file_size:
                result.skipped = f"larger than {self.max_file_size} bytes"
                return result
            content = path.read_bytes()
        except OSError as exc:
            result.error = f"{type(exc).__name__}: {exc.strerror or exc}"
            return result

        result.sha256, result.detections = self._scan_bytes(path, content, depth=0)
        return result

    def scan_bytes(self, name: str, content: bytes) -> ScanResult:
        result = ScanResult(path=name, size=len(content))
        result.sha256, result.detections = self._scan_bytes(Path(name), content, depth=0)
        return result

    def iter_files(self, root: str | Path) -> Iterator[Path]:
        root = Path(root)
        if root.is_file():
            yield root
            return
        for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
            current = Path(dirpath)
            dirnames[:] = [
                d for d in dirnames
                if str(current / d) not in SKIP_DIRS and not self._is_excluded(current / d)
            ]
            for filename in filenames:
                file_path = current / filename
                if not self._is_excluded(file_path):
                    yield file_path

    def scan_path(
        self,
        root: str | Path,
        on_result: Callable[[ScanResult], None] | None = None,
        should_stop: Callable[[], bool] | None = None,
    ) -> list[ScanResult]:
        results = []
        for file_path in self.iter_files(root):
            if should_stop and should_stop():
                break
            result = self.scan_file(file_path)
            results.append(result)
            if on_result:
                on_result(result)
        return results

    # ----------------------------------------------------------------- private

    def _is_excluded(self, path: Path) -> bool:
        try:
            resolved = path.resolve()
        except OSError:
            return False
        return any(resolved == ex or ex in resolved.parents for ex in self.exclude)

    def _scan_bytes(self, path: Path, content: bytes, depth: int) -> tuple[str, list[Detection]]:
        sha256 = hashlib.sha256(content).hexdigest()
        md5 = hashlib.md5(content, usedforsecurity=False).hexdigest()
        detections: list[Detection] = []

        threat = self.db.match_hash(sha256, md5)
        if threat:
            detections.append(Detection(threat, "hash", "high", [f"sha256={sha256}"]))
            return sha256, detections  # exact match; no need to look further

        for sig in self.db.match_patterns(content):
            detections.append(Detection(sig.name, "pattern", sig.severity))

        if self.use_heuristics:
            hits = heuristics.analyze(path, content)
            score = sum(h.score for h in hits)
            if score >= self.heuristic_threshold:
                severity = "high" if score >= self.heuristic_threshold * 2 else "medium"
                detections.append(
                    Detection(
                        f"Heuristic.Suspicious (score {score})",
                        "heuristic",
                        severity,
                        [f"{h.name} (+{h.score})" for h in hits],
                    )
                )

        if self.scan_archives and depth < MAX_ARCHIVE_DEPTH and content[:4] == b"PK\x03\x04":
            detections.extend(self._scan_zip(content, depth))

        return sha256, detections

    def _scan_zip(self, content: bytes, depth: int) -> list[Detection]:
        detections = []
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as archive:
                for info in archive.infolist():
                    if info.is_dir() or info.file_size > MAX_ARCHIVE_MEMBER_SIZE:
                        continue
                    try:
                        member = archive.read(info)
                    except (RuntimeError, zipfile.BadZipFile, NotImplementedError):
                        continue  # encrypted or unsupported compression
                    _, inner = self._scan_bytes(Path(info.filename), member, depth + 1)
                    for det in inner:
                        det.details.insert(0, f"inside archive: {info.filename}")
                        detections.append(det)
        except zipfile.BadZipFile:
            pass
        return detections
