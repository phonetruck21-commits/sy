"""Real-time protection: watch directories and scan new or modified files.

Uses portable polling (no third-party dependencies), so it works on
Windows, macOS and Linux.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Callable, Iterable

from .scanner import ScanResult, Scanner


class DirectoryMonitor:
    def __init__(
        self,
        scanner: Scanner,
        paths: Iterable[str | Path],
        on_result: Callable[[ScanResult], None],
        interval: float = 2.0,
    ):
        self.scanner = scanner
        self.paths = [Path(p) for p in paths]
        self.on_result = on_result
        self.interval = interval
        self._seen: dict[Path, tuple[float, int]] = {}
        self._running = False

    def _snapshot(self) -> dict[Path, tuple[float, int]]:
        snap = {}
        for root in self.paths:
            for file_path in self.scanner.iter_files(root):
                try:
                    st = file_path.stat()
                except OSError:
                    continue
                snap[file_path] = (st.st_mtime, st.st_size)
        return snap

    def prime(self) -> None:
        """Record the current state so only future changes get scanned."""
        self._seen = self._snapshot()

    def poll_once(self) -> list[ScanResult]:
        current = self._snapshot()
        results = []
        for file_path, signature in current.items():
            if self._seen.get(file_path) != signature:
                result = self.scanner.scan_file(file_path)
                results.append(result)
                self.on_result(result)
        self._seen = current
        return results

    def run(self) -> None:
        self._running = True
        self.prime()
        while self._running:
            time.sleep(self.interval)
            self.poll_once()

    def stop(self) -> None:
        self._running = False
