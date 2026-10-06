"""Tkinter desktop interface for SY Antivirus."""

from __future__ import annotations

import queue
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from . import __version__
from .monitor import DirectoryMonitor
from .quarantine import Quarantine
from .scanner import ScanResult, Scanner


class AntivirusApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(f"SY Antivirus {__version__}")
        self.geometry("900x560")
        self.minsize(700, 420)

        self.scanner = Scanner()
        self.quarantine = Quarantine()
        self.scanner.exclude.append(self.quarantine.directory.resolve())
        self.events: queue.Queue = queue.Queue()
        self.stop_scan = threading.Event()
        self.scan_thread: threading.Thread | None = None
        self.monitor: DirectoryMonitor | None = None
        self.results: dict[str, ScanResult] = {}

        notebook = ttk.Notebook(self)
        notebook.pack(fill="both", expand=True, padx=8, pady=8)
        notebook.add(self._build_scan_tab(notebook), text="סריקה")
        notebook.add(self._build_realtime_tab(notebook), text="הגנה בזמן אמת")
        notebook.add(self._build_quarantine_tab(notebook), text="הסגר")

        self.status = tk.StringVar(value=f"{len(self.scanner.db)} חתימות נטענו")
        ttk.Label(self, textvariable=self.status, anchor="e").pack(fill="x", padx=8, pady=(0, 6))
        self.after(100, self._drain_events)
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # -------------------------------------------------------------- scan tab

    def _build_scan_tab(self, parent):
        frame = ttk.Frame(parent, padding=8)
        buttons = ttk.Frame(frame)
        buttons.pack(fill="x")
        ttk.Button(buttons, text="סריקה מהירה (הורדות)", command=self._quick_scan).pack(side="right", padx=4)
        ttk.Button(buttons, text="סרוק תיקייה...", command=self._choose_folder).pack(side="right", padx=4)
        ttk.Button(buttons, text="סרוק קובץ...", command=self._choose_file).pack(side="right", padx=4)
        self.stop_button = ttk.Button(buttons, text="עצור", command=self.stop_scan.set, state="disabled")
        self.stop_button.pack(side="left", padx=4)

        self.progress_text = tk.StringVar(value="")
        ttk.Label(frame, textvariable=self.progress_text, anchor="w").pack(fill="x", pady=(8, 2))
        self.progress = ttk.Progressbar(frame, mode="indeterminate")
        self.progress.pack(fill="x")

        columns = ("status", "threat", "path")
        self.tree = ttk.Treeview(frame, columns=columns, show="headings", selectmode="extended")
        for col, title, width in [("status", "מצב", 90), ("threat", "איום", 260), ("path", "נתיב", 480)]:
            self.tree.heading(col, text=title)
            self.tree.column(col, width=width, anchor="w")
        self.tree.tag_configure("infected", foreground="#c62828")
        self.tree.tag_configure("suspicious", foreground="#ef6c00")
        self.tree.pack(fill="both", expand=True, pady=8)

        actions = ttk.Frame(frame)
        actions.pack(fill="x")
        ttk.Button(actions, text="העבר להסגר", command=self._quarantine_selected).pack(side="right", padx=4)
        ttk.Button(actions, text="פרטים", command=self._show_details).pack(side="right", padx=4)
        return frame

    def _choose_file(self):
        path = filedialog.askopenfilename()
        if path:
            self._start_scan(path)

    def _choose_folder(self):
        path = filedialog.askdirectory()
        if path:
            self._start_scan(path)

    def _quick_scan(self):
        downloads = Path.home() / "Downloads"
        self._start_scan(str(downloads if downloads.exists() else Path.home()))

    def _start_scan(self, target: str):
        if self.scan_thread and self.scan_thread.is_alive():
            messagebox.showinfo("SY Antivirus", "סריקה כבר רצה")
            return
        self.tree.delete(*self.tree.get_children())
        self.results.clear()
        self.stop_scan.clear()
        self.stop_button.config(state="normal")
        self.progress.start(12)
        self.counts = {"files": 0, "threats": 0}

        def worker():
            self.scanner.scan_path(
                target,
                on_result=lambda r: self.events.put(("result", r)),
                should_stop=self.stop_scan.is_set,
            )
            self.events.put(("done", None))

        self.scan_thread = threading.Thread(target=worker, daemon=True)
        self.scan_thread.start()

    def _add_result_row(self, result: ScanResult, prefix: str = ""):
        if not result.detections:
            return
        tag = "infected" if result.infected else "suspicious"
        status = "נגוע" if result.infected else "חשוד"
        threat = ", ".join(d.threat for d in result.detections)
        iid = f"{prefix}{result.path}"
        if self.tree.exists(iid):
            self.tree.delete(iid)
        self.results[iid] = result
        self.tree.insert("", 0, iid=iid, values=(status, threat, result.path), tags=(tag,))

    def _selected_results(self) -> list[tuple[str, ScanResult]]:
        return [(iid, self.results[iid]) for iid in self.tree.selection() if iid in self.results]

    def _show_details(self):
        for _, result in self._selected_results()[:1]:
            lines = [result.path, f"SHA-256: {result.sha256}", ""]
            for det in result.detections:
                lines.append(f"{det.threat}  [{det.method} / {det.severity}]")
                lines.extend(f"   • {d}" for d in det.details)
            messagebox.showinfo("פרטי זיהוי", "\n".join(lines))

    def _quarantine_selected(self):
        selected = self._selected_results()
        if not selected:
            return
        if not messagebox.askyesno("SY Antivirus", f"להעביר {len(selected)} קבצים להסגר?"):
            return
        for iid, result in selected:
            try:
                self.quarantine.add(result.path, result.detections[0].threat, result.sha256)
            except OSError as exc:
                messagebox.showerror("שגיאה", f"{result.path}\n{exc}")
                continue
            self.tree.delete(iid)
            self.results.pop(iid, None)
        self._refresh_quarantine()

    # ---------------------------------------------------------- realtime tab

    def _build_realtime_tab(self, parent):
        frame = ttk.Frame(parent, padding=8)
        top = ttk.Frame(frame)
        top.pack(fill="x")
        self.watch_path = tk.StringVar(value=str(Path.home() / "Downloads"))
        ttk.Label(top, text="תיקייה לניטור:").pack(side="right")
        ttk.Entry(top, textvariable=self.watch_path).pack(side="right", fill="x", expand=True, padx=4)
        ttk.Button(top, text="...", width=3,
                   command=lambda: self.watch_path.set(filedialog.askdirectory() or self.watch_path.get())
                   ).pack(side="right")
        self.auto_quarantine = tk.BooleanVar(value=True)
        ttk.Checkbutton(frame, text="העבר איומים להסגר אוטומטית", variable=self.auto_quarantine).pack(anchor="e", pady=6)
        self.monitor_button = ttk.Button(frame, text="הפעל הגנה", command=self._toggle_monitor)
        self.monitor_button.pack(anchor="e")
        self.log = tk.Text(frame, height=15, state="disabled")
        self.log.pack(fill="both", expand=True, pady=8)
        return frame

    def _log(self, message: str):
        self.log.config(state="normal")
        self.log.insert("end", message + "\n")
        self.log.see("end")
        self.log.config(state="disabled")

    def _toggle_monitor(self):
        if self.monitor:
            self.monitor.stop()
            self.monitor = None
            self.monitor_button.config(text="הפעל הגנה")
            self._log("ההגנה בזמן אמת הופסקה")
            return
        path = self.watch_path.get()
        if not Path(path).is_dir():
            messagebox.showerror("שגיאה", "התיקייה לא קיימת")
            return
        self.monitor = DirectoryMonitor(self.scanner, [path], lambda r: self.events.put(("live", r)))
        threading.Thread(target=self.monitor.run, daemon=True).start()
        self.monitor_button.config(text="עצור הגנה")
        self._log(f"מנטר את {path}")

    # -------------------------------------------------------- quarantine tab

    def _build_quarantine_tab(self, parent):
        frame = ttk.Frame(parent, padding=8)
        columns = ("date", "threat", "path")
        self.qtree = ttk.Treeview(frame, columns=columns, show="headings")
        for col, title, width in [("date", "תאריך", 160), ("threat", "איום", 240), ("path", "נתיב מקורי", 420)]:
            self.qtree.heading(col, text=title)
            self.qtree.column(col, width=width, anchor="w")
        self.qtree.pack(fill="both", expand=True)
        actions = ttk.Frame(frame)
        actions.pack(fill="x", pady=8)
        ttk.Button(actions, text="מחק לצמיתות", command=self._q_delete).pack(side="right", padx=4)
        ttk.Button(actions, text="שחזר", command=self._q_restore).pack(side="right", padx=4)
        ttk.Button(actions, text="רענן", command=self._refresh_quarantine).pack(side="left", padx=4)
        self._refresh_quarantine()
        return frame

    def _refresh_quarantine(self):
        self.qtree.delete(*self.qtree.get_children())
        for e in self.quarantine.list():
            self.qtree.insert("", "end", iid=e.id, values=(e.quarantined_at, e.threat, e.original_path))

    def _q_restore(self):
        for entry_id in self.qtree.selection():
            if not messagebox.askyesno("אזהרה", "שחזור קובץ זדוני עלול לסכן את המחשב. להמשיך?"):
                return
            try:
                self.quarantine.restore(entry_id)
            except (OSError, KeyError) as exc:
                messagebox.showerror("שגיאה", str(exc))
        self._refresh_quarantine()

    def _q_delete(self):
        selected = self.qtree.selection()
        if selected and messagebox.askyesno("SY Antivirus", f"למחוק {len(selected)} קבצים לצמיתות?"):
            for entry_id in selected:
                self.quarantine.delete(entry_id)
            self._refresh_quarantine()

    # --------------------------------------------------------------- events

    def _drain_events(self):
        try:
            while True:
                kind, result = self.events.get_nowait()
                if kind == "result":
                    self.counts["files"] += 1
                    if result.detections:
                        self.counts["threats"] += 1
                        self._add_result_row(result)
                    self.progress_text.set(
                        f"נסרקו {self.counts['files']} קבצים, נמצאו {self.counts['threats']} איומים — {result.path}"
                    )
                elif kind == "done":
                    self.progress.stop()
                    self.stop_button.config(state="disabled")
                    self.progress_text.set(
                        f"הסריקה הסתיימה: {self.counts['files']} קבצים, {self.counts['threats']} איומים"
                    )
                elif kind == "live" and result.detections:
                    threat = result.detections[0].threat
                    self._log(f"⚠ {threat}: {result.path}")
                    if self.auto_quarantine.get():
                        try:
                            self.quarantine.add(result.path, threat, result.sha256)
                            self._log("   הועבר להסגר")
                            self._refresh_quarantine()
                        except OSError as exc:
                            self._log(f"   לא ניתן להעביר להסגר: {exc}")
                    else:
                        self._add_result_row(result, prefix="live|")
        except queue.Empty:
            pass
        self.after(100, self._drain_events)

    def _on_close(self):
        self.stop_scan.set()
        if self.monitor:
            self.monitor.stop()
        self.destroy()


def main():
    AntivirusApp().mainloop()


if __name__ == "__main__":
    main()
