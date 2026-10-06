"""Heuristic checks that flag suspicious files without a known signature."""

from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

EXECUTABLE_EXTENSIONS = {
    ".exe", ".dll", ".scr", ".com", ".pif", ".bat", ".cmd", ".vbs", ".vbe",
    ".js", ".jse", ".wsf", ".wsh", ".ps1", ".hta", ".msi", ".jar", ".lnk",
}
DOCUMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt",
    ".jpg", ".jpeg", ".png", ".gif", ".mp3", ".mp4", ".zip", ".rar",
}

# (name, regex over bytes, score). Scores add up; total >= threshold => detection.
SUSPICIOUS_STRINGS: list[tuple[str, re.Pattern, int]] = [
    (name, re.compile(pattern, re.IGNORECASE), score)
    for name, pattern, score in [
        ("PowerShell encoded command", rb"powershell(\.exe)?\s+.*-(e|enc|encodedcommand)\s+[A-Za-z0-9+/=]{20,}", 40),
        ("PowerShell download cradle", rb"(New-Object\s+Net\.WebClient|Invoke-WebRequest|iwr\s).{0,200}(DownloadString|DownloadFile|-OutFile)", 30),
        ("Invoke-Expression", rb"\b(Invoke-Expression|IEX)\s*\(", 20),
        ("Shadow copy deletion", rb"vssadmin(\.exe)?\s+delete\s+shadows", 50),
        ("Boot recovery disabled", rb"bcdedit(\.exe)?\s+/set\s+.*recoveryenabled\s+no", 40),
        ("Ransom note text", rb"(your files (have been|are) encrypted|pay .{0,40}bitcoin|decrypt(ion)? key)", 35),
        ("Registry Run key persistence", rb"\\CurrentVersion\\Run(Once)?\b", 15),
        ("Process injection APIs", rb"(VirtualAllocEx|WriteProcessMemory|CreateRemoteThread)", 25),
        ("Keylogger APIs", rb"(GetAsyncKeyState|SetWindowsHookEx)", 20),
        ("Reverse shell", rb"(/bin/(ba)?sh\s+-i\s*>&\s*/dev/tcp/|nc(at)?\s+-e\s+/bin/(ba)?sh)", 45),
        ("Curl/wget pipe to shell", rb"(curl|wget)\s+[^|\n]{1,200}\|\s*(sudo\s+)?(ba)?sh\b", 25),
        ("Disable Windows Defender", rb"Set-MpPreference\s+-Disable(RealtimeMonitoring|BehaviorMonitoring)", 40),
        ("Base64 eval (PHP webshell)", rb"eval\s*\(\s*(base64_decode|gzinflate|str_rot13)\s*\(", 40),
        ("Office macro auto-exec", rb"\b(AutoOpen|Document_Open|Workbook_Open)\b.{0,2000}\b(Shell|CreateObject)\b", 35),
        ("Crypto miner", rb"(stratum\+tcp://|xmrig|cryptonight)", 35),
    ]
]


@dataclass
class HeuristicHit:
    name: str
    score: int


def shannon_entropy(data: bytes) -> float:
    """Entropy in bits per byte (0..8). Packed/encrypted data is close to 8."""
    if not data:
        return 0.0
    length = len(data)
    return -sum((c / length) * math.log2(c / length) for c in Counter(data).values())


def analyze(path: Path, content: bytes) -> list[HeuristicHit]:
    hits: list[HeuristicHit] = []
    name = path.name.lower()
    suffixes = [s.lower() for s in path.suffixes]

    # Double extension, e.g. "invoice.pdf.exe".
    if len(suffixes) >= 2 and suffixes[-1] in EXECUTABLE_EXTENSIONS and suffixes[-2] in DOCUMENT_EXTENSIONS:
        hits.append(HeuristicHit(f"Double extension ({''.join(suffixes[-2:])})", 50))

    # Right-to-left override character used to disguise extensions.
    if "‮" in path.name:
        hits.append(HeuristicHit("Right-to-left override in file name", 50))

    # Windows executable hiding behind a non-executable extension.
    is_pe = content[:2] == b"MZ" and b"PE\x00\x00" in content[:1024]
    if is_pe and suffixes and suffixes[-1] in DOCUMENT_EXTENSIONS:
        hits.append(HeuristicHit("Executable disguised as document", 50))

    # High entropy in an executable usually means a packer or encrypted payload.
    if is_pe or (suffixes and suffixes[-1] in EXECUTABLE_EXTENSIONS):
        if len(content) > 4096 and shannon_entropy(content) > 7.2:
            hits.append(HeuristicHit("Packed/encrypted executable (high entropy)", 25))

    for label, regex, score in SUSPICIOUS_STRINGS:
        if regex.search(content):
            hits.append(HeuristicHit(label, score))

    if name.startswith("autorun.inf") or name == "autorun.inf":
        if re.search(rb"^\s*(open|shellexecute)\s*=", content, re.IGNORECASE | re.MULTILINE):
            hits.append(HeuristicHit("Autorun.inf launching a program", 30))

    return hits
