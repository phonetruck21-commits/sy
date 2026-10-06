"""Command-line interface: `sy-av scan|monitor|quarantine|db|gui`."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from . import __version__
from .monitor import DirectoryMonitor
from .quarantine import Quarantine
from .scanner import ScanResult, Scanner
from .signatures import SignatureDB

RED, YELLOW, GREEN, DIM, RESET = "\033[31m", "\033[33m", "\033[32m", "\033[2m", "\033[0m"


def _color(text: str, color: str) -> str:
    return f"{color}{text}{RESET}" if sys.stdout.isatty() else text


def _build_scanner(args) -> Scanner:
    db = SignatureDB(args.db) if args.db else SignatureDB()
    return Scanner(
        db=db,
        max_file_size=args.max_size * 1024 * 1024,
        use_heuristics=not args.no_heuristics,
        scan_archives=not args.no_archives,
        exclude=args.exclude or [],
    )


def _print_result(result: ScanResult, verbose: bool) -> None:
    if result.detections:
        label = _color("INFECTED", RED) if result.infected else _color("SUSPICIOUS", YELLOW)
        print(f"{label}  {result.path}")
        for det in result.detections:
            print(f"    -> {det.threat} [{det.method}, {det.severity}]")
            for detail in det.details:
                print(_color(f"       {detail}", DIM))
    elif result.error and verbose:
        print(_color(f"ERROR     {result.path}: {result.error}", DIM))
    elif result.skipped and verbose:
        print(_color(f"SKIPPED   {result.path} ({result.skipped})", DIM))
    elif verbose:
        print(_color(f"OK        {result.path}", GREEN))


def _handle_threat(result: ScanResult, action: str, quarantine: Quarantine | None) -> None:
    if not result.detections or action == "report":
        return
    if action == "quarantine-high" and not result.infected:
        return
    try:
        if action == "delete":
            Path(result.path).unlink()
            print(_color(f"    deleted {result.path}", RED))
        else:
            entry = quarantine.add(result.path, result.detections[0].threat, result.sha256)
            print(_color(f"    quarantined as {entry.id[:12]}", YELLOW))
    except OSError as exc:
        print(_color(f"    could not {action} file: {exc}", RED))


def cmd_scan(args) -> int:
    scanner = _build_scanner(args)
    quarantine = Quarantine(args.quarantine_dir) if args.action.startswith("quarantine") else None
    if quarantine:
        scanner.exclude.append(quarantine.directory.resolve())

    stats = {"files": 0, "infected": 0, "suspicious": 0, "errors": 0, "skipped": 0}
    threats = []
    started = time.monotonic()

    def on_result(result: ScanResult) -> None:
        stats["files"] += 1
        if result.infected:
            stats["infected"] += 1
        elif result.suspicious:
            stats["suspicious"] += 1
        if result.error:
            stats["errors"] += 1
        if result.skipped:
            stats["skipped"] += 1
        if args.json:
            if result.detections:
                threats.append({
                    "path": result.path,
                    "sha256": result.sha256,
                    "detections": [vars(d) for d in result.detections],
                })
        else:
            _print_result(result, args.verbose)
        _handle_threat(result, args.action, quarantine)

    if not args.json:
        print(f"SY Antivirus {__version__} - {len(scanner.db)} signatures loaded")
    for target in args.paths:
        if not Path(target).exists():
            print(f"path not found: {target}", file=sys.stderr)
            return 2
        scanner.scan_path(target, on_result=on_result)

    elapsed = time.monotonic() - started
    if args.json:
        print(json.dumps({"stats": stats, "seconds": round(elapsed, 2), "threats": threats}, indent=2))
    else:
        print("-" * 60)
        print(
            f"Scanned {stats['files']} files in {elapsed:.1f}s: "
            f"{_color(str(stats['infected']) + ' infected', RED if stats['infected'] else GREEN)}, "
            f"{stats['suspicious']} suspicious, {stats['errors']} errors, {stats['skipped']} skipped"
        )
    return 1 if stats["infected"] or stats["suspicious"] else 0


def cmd_monitor(args) -> int:
    scanner = _build_scanner(args)
    quarantine = Quarantine(args.quarantine_dir) if args.action.startswith("quarantine") else None
    if quarantine:
        scanner.exclude.append(quarantine.directory.resolve())

    def on_result(result: ScanResult) -> None:
        _print_result(result, args.verbose)
        _handle_threat(result, args.action, quarantine)

    monitor = DirectoryMonitor(scanner, args.paths, on_result, interval=args.interval)
    print(f"Real-time protection active on: {', '.join(args.paths)} (Ctrl+C to stop)")
    try:
        monitor.run()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


def cmd_quarantine(args) -> int:
    quarantine = Quarantine(args.quarantine_dir)
    try:
        if args.qcmd == "list":
            entries = quarantine.list()
            if not entries:
                print("quarantine is empty")
            for e in entries:
                print(f"{e.id[:12]}  {e.quarantined_at}  {e.threat:<35} {e.original_path}")
        elif args.qcmd == "restore":
            target = quarantine.restore(args.id, args.to, overwrite=args.force)
            print(f"restored to {target}")
        elif args.qcmd == "delete":
            entry = quarantine.delete(args.id)
            print(f"permanently deleted {entry.original_path}")
    except (KeyError, FileExistsError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


def cmd_db(args) -> int:
    db = SignatureDB(args.db) if args.db else SignatureDB()
    if args.dbcmd == "info":
        print(f"database: {db.path}")
        print(f"hash signatures:    {len(db.hashes)}")
        print(f"pattern signatures: {len(db.patterns)}")
        return 0
    if args.dbcmd == "add-hash":
        db.add_hash(args.hash, args.name)
    elif args.dbcmd == "add-file":
        digest = db.add_file(args.file, args.name)
        print(f"sha256 {digest}")
    elif args.dbcmd == "add-pattern":
        db.add_pattern(args.name, args.pattern, args.severity)
    elif args.dbcmd == "import":
        # Plain text: one hash per line, optionally "hash name".
        count = 0
        for line in Path(args.file).read_text(encoding="utf-8").splitlines():
            parts = line.split(None, 1)
            if not parts or parts[0].startswith("#"):
                continue
            try:
                db.add_hash(parts[0], parts[1].strip() if len(parts) > 1 else args.name)
                count += 1
            except ValueError:
                continue
        print(f"imported {count} hashes")
    db.save()
    print(f"saved {db.path}")
    return 0


def cmd_gui(args) -> int:
    from .gui import main as gui_main
    gui_main()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="sy-av", description="SY Antivirus")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--db", help="path to a custom signatures.json")
    parser.add_argument("--quarantine-dir", help="quarantine directory (default ~/.sy_antivirus/quarantine)")
    sub = parser.add_subparsers(dest="command", required=True)

    def scan_options(p):
        p.add_argument("paths", nargs="+", help="files or directories")
        p.add_argument("-a", "--action", default="report",
                       choices=["report", "quarantine", "quarantine-high", "delete"],
                       help="what to do with detected files (default: report)")
        p.add_argument("-x", "--exclude", action="append", help="path to exclude (repeatable)")
        p.add_argument("--max-size", type=int, default=100, help="skip files larger than N MB")
        p.add_argument("--no-heuristics", action="store_true")
        p.add_argument("--no-archives", action="store_true", help="don't look inside ZIP files")
        p.add_argument("-v", "--verbose", action="store_true", help="also print clean files")

    p_scan = sub.add_parser("scan", help="scan files or directories")
    scan_options(p_scan)
    p_scan.add_argument("--json", action="store_true", help="machine-readable output")
    p_scan.set_defaults(func=cmd_scan)

    p_mon = sub.add_parser("monitor", help="real-time protection for directories")
    scan_options(p_mon)
    p_mon.add_argument("--interval", type=float, default=2.0, help="poll interval in seconds")
    p_mon.set_defaults(func=cmd_monitor)

    p_q = sub.add_parser("quarantine", help="manage quarantined files")
    qsub = p_q.add_subparsers(dest="qcmd", required=True)
    qsub.add_parser("list")
    p_r = qsub.add_parser("restore")
    p_r.add_argument("id")
    p_r.add_argument("--to", help="restore to a different path")
    p_r.add_argument("--force", action="store_true", help="overwrite existing file")
    p_d = qsub.add_parser("delete")
    p_d.add_argument("id")
    p_q.set_defaults(func=cmd_quarantine)

    p_db = sub.add_parser("db", help="manage the signature database")
    dsub = p_db.add_subparsers(dest="dbcmd", required=True)
    dsub.add_parser("info")
    p_h = dsub.add_parser("add-hash")
    p_h.add_argument("hash")
    p_h.add_argument("name")
    p_f = dsub.add_parser("add-file")
    p_f.add_argument("file")
    p_f.add_argument("name")
    p_p = dsub.add_parser("add-pattern")
    p_p.add_argument("name")
    p_p.add_argument("pattern", help="regular expression over file bytes")
    p_p.add_argument("--severity", default="high", choices=["high", "medium"])
    p_i = dsub.add_parser("import", help="import a text file of hashes")
    p_i.add_argument("file")
    p_i.add_argument("--name", default="Imported.Malware")
    p_db.set_defaults(func=cmd_db)

    p_gui = sub.add_parser("gui", help="open the graphical interface")
    p_gui.set_defaults(func=cmd_gui)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
