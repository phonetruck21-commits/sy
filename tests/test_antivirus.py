import io
import json
import os
import tempfile
import unittest
import zipfile
from contextlib import redirect_stdout
from pathlib import Path

from sy_antivirus import Quarantine, Scanner, SignatureDB
from sy_antivirus.cli import main as cli_main
from sy_antivirus.heuristics import shannon_entropy
from sy_antivirus.monitor import DirectoryMonitor

# Built at runtime so this source file itself is never flagged by real antivirus software.
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + b"EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmp = Path(self._tmp.name)
        self.scanner = Scanner()

    def tearDown(self):
        self._tmp.cleanup()

    def write(self, name: str, content: bytes) -> Path:
        path = self.tmp / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return path


class ScannerTests(Base):
    def test_eicar_detected_by_hash(self):
        result = self.scanner.scan_file(self.write("eicar.com", EICAR))
        self.assertTrue(result.infected)
        self.assertEqual(result.detections[0].threat, "EICAR-Test-File")
        self.assertEqual(result.detections[0].method, "hash")

    def test_eicar_embedded_detected_by_pattern(self):
        result = self.scanner.scan_file(self.write("blob.dat", b"junk" * 50 + EICAR + b"more"))
        self.assertTrue(result.infected)
        self.assertEqual(result.detections[0].method, "pattern")

    def test_clean_file(self):
        result = self.scanner.scan_file(self.write("notes.txt", b"just some harmless notes\n"))
        self.assertTrue(result.clean)

    def test_eicar_inside_zip(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("readme.txt", "hello")
            zf.writestr("payload/eicar.com", EICAR)
        result = self.scanner.scan_file(self.write("archive.zip", buf.getvalue()))
        self.assertTrue(result.infected)
        self.assertTrue(any("inside archive: payload/eicar.com" in d.details for d in result.detections))

    def test_heuristic_ransomware_script(self):
        script = (
            b"vssadmin delete shadows /all /quiet\r\n"
            b"bcdedit /set {default} recoveryenabled no\r\n"
            b"echo Your files have been encrypted > README.txt\r\n"
        )
        result = self.scanner.scan_file(self.write("run.bat", script))
        self.assertTrue(result.detections)
        self.assertEqual(result.detections[0].method, "heuristic")
        self.assertTrue(result.infected)

    def test_double_extension_and_disguised_exe(self):
        fake_pe = b"MZ" + b"\x00" * 62 + b"PE\x00\x00" + b"\x00" * 100
        for name in ("invoice.pdf.exe", "photo.jpg"):
            result = self.scanner.scan_file(self.write(name, fake_pe))
            self.assertTrue(result.suspicious, name)
            self.assertEqual(result.detections[0].method, "heuristic")

    def test_heuristics_can_be_disabled(self):
        scanner = Scanner(use_heuristics=False)
        result = scanner.scan_file(self.write("x.bat", b"vssadmin delete shadows /all\nyour files have been encrypted"))
        self.assertTrue(result.clean)

    def test_size_limit_skips(self):
        scanner = Scanner(max_file_size=10)
        result = scanner.scan_file(self.write("big.bin", EICAR))
        self.assertIsNotNone(result.skipped)
        self.assertFalse(result.detections)

    def test_scan_path_and_exclude(self):
        self.write("a/clean.txt", b"ok")
        self.write("a/eicar.com", EICAR)
        self.write("b/eicar.com", EICAR)
        scanner = Scanner(exclude=[self.tmp / "b"])
        results = scanner.scan_path(self.tmp)
        infected = [r.path for r in results if r.infected]
        self.assertEqual(len(results), 2)
        self.assertEqual(infected, [str(self.tmp / "a" / "eicar.com")])

    def test_does_not_flag_its_own_rules(self):
        package = Path(__file__).resolve().parent.parent / "sy_antivirus"
        self.assertEqual([r for r in self.scanner.scan_path(package) if r.detections], [])

    def test_entropy(self):
        self.assertEqual(shannon_entropy(b"aaaa"), 0.0)
        self.assertAlmostEqual(shannon_entropy(bytes(range(256))), 8.0)


class SignatureDBTests(Base):
    def test_add_and_save_custom_signatures(self):
        db_path = self.tmp / "db.json"
        db = SignatureDB(db_path)
        sample = self.write("custom.bin", b"my custom malware sample")
        db.add_file(sample, "Custom.Malware")
        db.add_pattern("Custom.Pattern", r"EVIL_MARKER_\d+")
        db.save()

        scanner = Scanner(db=SignatureDB(db_path))
        self.assertEqual(scanner.scan_file(sample).detections[0].threat, "Custom.Malware")
        other = self.write("other.txt", b"hello EVIL_MARKER_42 world")
        self.assertEqual(scanner.scan_file(other).detections[0].threat, "Custom.Pattern")

    def test_invalid_hash_rejected(self):
        with self.assertRaises(ValueError):
            SignatureDB(self.tmp / "db.json").add_hash("not-a-hash", "x")


class QuarantineTests(Base):
    def test_quarantine_restore_delete(self):
        q = Quarantine(self.tmp / "q")
        sample = self.write("eicar.com", EICAR)
        os.chmod(sample, 0o640)
        entry = q.add(sample, "EICAR-Test-File")

        self.assertFalse(sample.exists())
        blob = (self.tmp / "q" / f"{entry.id}.bin").read_bytes()
        self.assertNotIn(b"EICAR", blob)  # stored obfuscated
        self.assertEqual(len(q.list()), 1)

        restored = q.restore(entry.id[:8])
        self.assertEqual(restored.read_bytes(), EICAR)
        self.assertEqual(restored.stat().st_mode & 0o777, 0o640)
        self.assertEqual(q.list(), [])

        entry = q.add(sample, "EICAR-Test-File")
        q.delete(entry.id)
        self.assertEqual(q.list(), [])
        with self.assertRaises(KeyError):
            q.restore(entry.id)


class MonitorTests(Base):
    def test_detects_new_and_modified_files(self):
        self.write("existing.txt", b"ok")
        found = []
        monitor = DirectoryMonitor(self.scanner, [self.tmp], found.append)
        monitor.prime()
        self.assertEqual(monitor.poll_once(), [])

        self.write("new.com", EICAR)
        results = monitor.poll_once()
        self.assertEqual(len(results), 1)
        self.assertTrue(results[0].infected)
        self.assertEqual(monitor.poll_once(), [])


class CLITests(Base):
    def run_cli(self, *args) -> tuple[int, str]:
        out = io.StringIO()
        with redirect_stdout(out):
            code = cli_main(["--quarantine-dir", str(self.tmp / "q"), *args])
        return code, out.getvalue()

    def test_scan_json_and_quarantine(self):
        self.write("files/eicar.com", EICAR)
        self.write("files/ok.txt", b"ok")
        code, out = self.run_cli("scan", "--json", str(self.tmp / "files"))
        self.assertEqual(code, 1)
        data = json.loads(out)
        self.assertEqual(data["stats"]["files"], 2)
        self.assertEqual(data["stats"]["infected"], 1)

        code, out = self.run_cli("scan", "-a", "quarantine", str(self.tmp / "files"))
        self.assertIn("quarantined", out)
        self.assertFalse((self.tmp / "files" / "eicar.com").exists())
        code, out = self.run_cli("quarantine", "list")
        self.assertIn("EICAR-Test-File", out)

    def test_clean_scan_exit_code(self):
        self.write("ok.txt", b"ok")
        code, _ = self.run_cli("scan", str(self.tmp / "ok.txt"))
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
