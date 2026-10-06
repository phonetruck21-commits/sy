"""Signature database: known-bad file hashes and byte patterns."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).parent / "data" / "signatures.json"


@dataclass(frozen=True)
class PatternSignature:
    name: str
    regex: re.Pattern
    severity: str = "high"


class SignatureDB:
    """Holds hash signatures (sha256 / md5) and byte-pattern signatures.

    The JSON format is::

        {
          "hashes": {"<sha256 or md5 hex>": "Threat.Name", ...},
          "patterns": [{"name": "...", "pattern": "<regex over bytes>", "severity": "high"}]
        }

    Patterns are Python regular expressions applied to the raw file bytes
    (decoded as latin-1 so every byte maps to one character).
    """

    def __init__(self, path: Path | str | None = None):
        self.path = Path(path) if path else DEFAULT_DB_PATH
        self.hashes: dict[str, str] = {}
        self.patterns: list[PatternSignature] = []
        if self.path.exists():
            self.load()

    def load(self) -> None:
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self.hashes = {h.lower(): name for h, name in data.get("hashes", {}).items()}
        self.patterns = [
            PatternSignature(
                name=p["name"],
                regex=re.compile(p["pattern"].encode("latin-1"), re.DOTALL),
                severity=p.get("severity", "high"),
            )
            for p in data.get("patterns", [])
        ]

    def save(self, path: Path | str | None = None) -> None:
        target = Path(path) if path else self.path
        target.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "hashes": dict(sorted(self.hashes.items())),
            "patterns": [
                {"name": p.name, "pattern": p.regex.pattern.decode("latin-1"), "severity": p.severity}
                for p in self.patterns
            ],
        }
        target.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def add_hash(self, digest: str, name: str) -> None:
        digest = digest.strip().lower()
        if not re.fullmatch(r"[0-9a-f]{32}|[0-9a-f]{64}", digest):
            raise ValueError("hash must be an MD5 (32 hex) or SHA-256 (64 hex) digest")
        self.hashes[digest] = name

    def add_file(self, file_path: Path | str, name: str) -> str:
        """Register the SHA-256 of an existing file as malicious. Returns the digest."""
        digest = hashlib.sha256(Path(file_path).read_bytes()).hexdigest()
        self.add_hash(digest, name)
        return digest

    def add_pattern(self, name: str, pattern: str, severity: str = "high") -> None:
        self.patterns.append(
            PatternSignature(name, re.compile(pattern.encode("latin-1"), re.DOTALL), severity)
        )

    def match_hash(self, sha256: str, md5: str) -> str | None:
        return self.hashes.get(sha256) or self.hashes.get(md5)

    def match_patterns(self, content: bytes) -> list[PatternSignature]:
        return [p for p in self.patterns if p.regex.search(content)]

    def __len__(self) -> int:
        return len(self.hashes) + len(self.patterns)
