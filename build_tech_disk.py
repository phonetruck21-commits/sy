#!/usr/bin/env python3
"""Build a categorized technician USB folder from official downloads."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import ssl
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "manifest.json"
USER_AGENT = "Wget/1.21.4"
BROWSER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
CTX = ssl.create_default_context()


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def selected(tool: dict, profile: str, only: set[str] | None) -> bool:
    if tool.get("kind") == "manual":
        return False
    if only and tool["id"] not in only:
        return False
    level = tool.get("profile", "core")
    if profile == "all":
        return True
    if profile == "full":
        return level in ("core", "full")
    return level == "core"


def fetch(url: str, agent: str = USER_AGENT, timeout: int = 60):
    req = urllib.request.Request(url, headers={"User-Agent": agent})
    return urllib.request.urlopen(req, timeout=timeout, context=CTX)


def read_text(url: str) -> str:
    agent = BROWSER_AGENT if "github.com" in url or "winscp.net" in url else USER_AGENT
    with fetch(url, agent=agent) as resp:
        return resp.read().decode("utf-8", "replace")


def filename_from_url(url: str, fallback: str) -> str:
    name = url.split("?", 1)[0].rstrip("/").split("/")[-1]
    name = urllib.request.unquote(name)
    if not name or "." not in name:
        return fallback
    return name


def resolve(tool: dict) -> tuple[str, str]:
    kind = tool["kind"]
    if kind == "url":
        url = tool["url"]
        name = tool.get("filename") or filename_from_url(url, tool["id"])
        return url, name
    if kind == "github":
        api = f"https://api.github.com/repos/{tool['repo']}/releases/latest"
        data = json.loads(read_text(api))
        pattern = re.compile(tool["asset_regex"], re.I)
        matches = [a for a in data.get("assets", []) if pattern.search(a["name"])]
        if not matches:
            names = ", ".join(a["name"] for a in data.get("assets", [])[:12])
            raise RuntimeError(f"no asset matched {tool['asset_regex']} ({names})")
        asset = sorted(matches, key=lambda a: a["name"])[-1]
        return asset["browser_download_url"], asset["name"]
    if kind == "page":
        html = read_text(tool["page"])
        found = sorted(set(re.findall(tool["match"], html, flags=re.I)))
        found = [item for item in found if not item.lower().endswith((".zsync", ".torrent", ".md5", ".sha256"))]
        if not found:
            raise RuntimeError(f"no link matched {tool['match']}")
        name = found[-1]
        if tool.get("url_template"):
            url = tool["url_template"].replace("{name}", name)
        elif name.startswith("http://") or name.startswith("https://"):
            url = name
        else:
            base = tool.get("base") or tool["page"]
            if not base.endswith("/"):
                base += "/"
            url = base + name
        if tool.get("follow"):
            html = read_text(url)
            followed = sorted(set(re.findall(tool["follow"], html, flags=re.I)))
            if not followed:
                raise RuntimeError("follow link not found")
            url = followed[-1]
        filename = tool.get("filename") or filename_from_url(url, tool["id"])
        return url, filename
    raise RuntimeError(f"unknown kind {kind}")


def looks_like_html(path: Path) -> bool:
    with path.open("rb") as handle:
        head = handle.read(64).lstrip()
    return head[:1] in (b"<",) or head[:9].lower().startswith(b"<!doctype") or head[:5].lower() == b"<html"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".partial")
    if partial.exists():
        partial.unlink()
    try:
        with fetch(url) as resp, partial.open("wb") as handle:
            while True:
                chunk = resp.read(256 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
        if not partial.exists() or partial.stat().st_size < 512 or looks_like_html(partial):
            raise RuntimeError("download was empty or an HTML page")
        partial.replace(dest)
    except Exception:
        if partial.exists():
            partial.unlink()
        raise


def unpack(archive: Path, mode: str, target: Path) -> list[Path]:
    target.mkdir(parents=True, exist_ok=True)
    if not zipfile.is_zipfile(archive):
        raise RuntimeError("unpack supports zip archives")
    written: list[Path] = []
    with zipfile.ZipFile(archive) as zf:
        if mode == "iso":
            members = [i for i in zf.infolist() if i.filename.lower().endswith((".iso", ".img")) and not i.is_dir()]
            if not members:
                raise RuntimeError("archive has no iso/img")
            for info in members:
                out = target / Path(info.filename).name
                with zf.open(info) as src, out.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
                written.append(out)
        else:
            zf.extractall(target)
            written.append(target)
    archive.unlink()
    return written


def write_shortcut(path: Path, url: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"[InternetShortcut]\r\nURL={url}\r\n", encoding="utf-8")


def write_index(dest: Path, categories: dict, downloaded: list[str], failed: list[str], manuals: list[dict], profile: str) -> None:
    lines = [
        "Technician-USB-Toolkit",
        "======================",
        "",
        f"פרופיל שהורד: {profile}",
        "",
        "הכנה של הכונן",
        "1. פתח את Portable/01-Boot/ventoy ומצא את Ventoy2Disk.exe",
        "2. הרץ אותו כמנהל, בחר את הכונן הנשלף, והתקן.",
        "3. העתק אל המחיצה הגדולה שנוצרה את התיקיות ISO, Portable, Links ואת הקובץ הזה.",
        "4. באתחול בוחרים ISO מתוך התפריט של Ventoy.",
        "5. תוכנות מתוך Portable רצות כש-Windows של הלקוח עולה.",
        "",
        "ISO של Windows מורידים עם Fido, מתוך תיקיית Portable/03-Installers:",
        "powershell -ExecutionPolicy Bypass -File .\\Fido.ps1 -Win 11 -Rel Latest -Ed Pro -Lang Hebrew -Arch x64",
        "",
        "לפני עבודה על דיסק של לקוח: לבדוק BitLocker ולבקש את מפתח השחזור, ולגבות קבצים לפני מחיקות או תיקון מחיצות.",
        "",
        "קטגוריות",
        "----------",
    ]
    for key, title in categories.items():
        lines.append(f"{key}  {title}")
    lines += ["", "ירדו אוטומטית", "---------------"]
    lines += downloaded or ["(אין)"]
    lines += ["", "להורדה ידנית מהקישורים בתיקיית Links", "----------------------------------"]
    for tool in manuals:
        title = categories.get(tool["category"], tool["category"])
        lines.append(f"- {title} / {tool['name']}: {tool['note']}")
    if failed:
        lines += ["", "נכשלו בהורדה", "-------------"]
        lines += [f"- {item}" for item in failed]
    text = "\n".join(lines) + "\n"
    (dest / "START-HERE.txt").write_text(text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a technician USB folder")
    parser.add_argument("--dest", default="Technician-USB-Toolkit")
    parser.add_argument("--profile", choices=("core", "full", "all"), default="full")
    parser.add_argument("--only", default="", help="comma-separated tool ids")
    parser.add_argument("--check", action="store_true", help="resolve URLs and read 16 bytes, do not save the disk")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    manifest = load_manifest()
    categories = manifest["categories"]
    only = {item.strip() for item in args.only.split(",") if item.strip()} or None
    dest = Path(args.dest).resolve()
    downloaded: list[str] = []
    failed: list[str] = []
    manuals = [tool for tool in manifest["tools"] if tool.get("kind") == "manual"]

    if not args.check:
        dest.mkdir(parents=True, exist_ok=True)
        for tool in manuals:
            write_shortcut(dest / "Links" / tool["category"] / f"{tool['id']}.url", tool["url"])

    tools = [tool for tool in manifest["tools"] if selected(tool, args.profile, only)]
    for tool in tools:
        label = f"{tool['name']} ({tool['id']})"
        try:
            marker = dest / ".done" / tool["id"]
            if not args.check and marker.exists() and not args.force:
                print(f"יש  {label}")
                downloaded.append(f"- {label} (כבר היה)")
                continue
            url, filename = resolve(tool)
            print(f"OK  {label}")
            print(f"    {filename}")
            print(f"    {url}")
            if args.check:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Range": "bytes=0-15"})
                with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
                    head = resp.read(16)
                if head[:1] == b"<":
                    raise RuntimeError("URL returned HTML")
                continue
            bucket = "ISO" if tool["bucket"] == "iso" else "Portable"
            folder = dest / bucket / tool["category"]
            target = folder / filename
            print(f"    מוריד...")
            download(url, target)
            mode = tool.get("unpack")
            if mode:
                unpack_target = folder if mode == "iso" else folder / tool["id"]
                unpack(target, mode, unpack_target)
            marker.parent.mkdir(parents=True, exist_ok=True)
            marker.write_text(url + "\n", encoding="utf-8")
            downloaded.append(f"- {label}")
        except Exception as exc:
            print(f"FAIL {label}: {exc}", file=sys.stderr)
            failed.append(f"{label}: {exc}")

    if not args.check:
        write_index(dest, categories, downloaded, failed, manuals, args.profile)
        print(f"\nהתיקייה מוכנה: {dest}")
    print(f"הצליחו: {len(downloaded) if not args.check else len(tools) - len(failed)}  נכשלו: {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
