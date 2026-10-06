"""SY Antivirus - a lightweight, dependency-free antivirus engine."""

__version__ = "0.1.0"

from .scanner import Scanner, ScanResult, Detection
from .signatures import SignatureDB
from .quarantine import Quarantine

__all__ = ["Scanner", "ScanResult", "Detection", "SignatureDB", "Quarantine", "__version__"]
