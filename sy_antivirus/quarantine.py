"""Quarantine: isolate detected files so they can't run, with restore support."""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_QUARANTINE_DIR = Path.home() / ".sy_antivirus" / "quarantine"
# Files are XOR-obfuscated so they cannot be executed or re-detected by accident.
XOR_KEY = 0xA5


def _xor(data: bytes) -> bytes:
    key = bytes([XOR_KEY]) * len(data)
    return (int.from_bytes(data, "little") ^ int.from_bytes(key, "little")).to_bytes(len(data), "little")


@dataclass
class QuarantineEntry:
    id: str
    original_path: str
    threat: str
    sha256: str | None
    quarantined_at: str
    mode: int


class Quarantine:
    def __init__(self, directory: Path | str | None = None):
        self.directory = Path(directory) if directory else DEFAULT_QUARANTINE_DIR
        self.directory.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.directory, 0o700)
        except OSError:
            pass

    def _blob(self, entry_id: str) -> Path:
        return self.directory / f"{entry_id}.bin"

    def _meta(self, entry_id: str) -> Path:
        return self.directory / f"{entry_id}.json"

    def add(self, path: str | Path, threat: str, sha256: str | None = None) -> QuarantineEntry:
        path = Path(path).resolve()
        data = path.read_bytes()
        entry = QuarantineEntry(
            id=uuid.uuid4().hex,
            original_path=str(path),
            threat=threat,
            sha256=sha256,
            quarantined_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            mode=path.stat().st_mode & 0o7777,
        )
        blob = self._blob(entry.id)
        blob.write_bytes(_xor(data))
        os.chmod(blob, 0o600)
        self._meta(entry.id).write_text(json.dumps(asdict(entry), indent=2), encoding="utf-8")
        path.unlink()
        return entry

    def list(self) -> list[QuarantineEntry]:
        entries = []
        for meta in sorted(self.directory.glob("*.json")):
            try:
                entries.append(QuarantineEntry(**json.loads(meta.read_text(encoding="utf-8"))))
            except (ValueError, TypeError):
                continue
        return sorted(entries, key=lambda e: e.quarantined_at)

    def get(self, entry_id: str) -> QuarantineEntry:
        matches = [e for e in self.list() if e.id.startswith(entry_id)]
        if not matches:
            raise KeyError(f"no quarantine entry matching '{entry_id}'")
        if len(matches) > 1:
            raise KeyError(f"'{entry_id}' is ambiguous ({len(matches)} matches)")
        return matches[0]

    def restore(self, entry_id: str, destination: str | Path | None = None, overwrite: bool = False) -> Path:
        entry = self.get(entry_id)
        target = Path(destination) if destination else Path(entry.original_path)
        if target.exists() and not overwrite:
            raise FileExistsError(f"{target} already exists")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(_xor(self._blob(entry.id).read_bytes()))
        os.chmod(target, entry.mode)
        self._remove_files(entry.id)
        return target

    def delete(self, entry_id: str) -> QuarantineEntry:
        entry = self.get(entry_id)
        self._remove_files(entry.id)
        return entry

    def _remove_files(self, entry_id: str) -> None:
        self._blob(entry_id).unlink(missing_ok=True)
        self._meta(entry_id).unlink(missing_ok=True)
