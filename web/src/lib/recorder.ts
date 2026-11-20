/**
 * Local recording with MediaRecorder. Works fully offline.
 *  - Desktop (Tauri): chunks are streamed to disk every 2s → long recordings are safe even if the app crashes.
 *  - Browser: chunks are kept in memory and saved to IndexedDB when stopped (suited to shorter clips).
 */
import { desktopAppendRecording, desktopFinishRecording, isDesktop } from './desktop';

export function pickRecordingMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((c) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) ?? '';
}

export interface RecordingResult {
  fileName: string;
  mime: string;
  blob: Blob | null; // null in desktop mode (file already on disk)
  path: string | null;
  size: number;
  durationSec: number;
}

export class LocalRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private writeQueue: Promise<void> = Promise.resolve();
  private startedAt = 0;
  private size = 0;
  private writeError: string | null = null;
  fileName = '';
  mime = '';

  get active() {
    return this.rec?.state === 'recording';
  }

  start(stream: MediaStream, label: string, videoBitsPerSecond = 8_000_000) {
    this.mime = pickRecordingMime();
    if (!this.mime) throw new Error('הקלטה אינה נתמכת במכשיר זה');
    const ext = this.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.fileName = `${label}_${stamp}.${ext}`.replace(/[^A-Za-z0-9_.-]/g, '_');
    this.chunks = [];
    this.size = 0;
    this.writeError = null;
    this.rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond, audioBitsPerSecond: 128_000 });
    const desktop = isDesktop();
    this.rec.ondataavailable = (ev) => {
      if (!ev.data.size) return;
      this.size += ev.data.size;
      if (desktop) {
        const name = this.fileName;
        this.writeQueue = this.writeQueue.then(async () => {
          try {
            await desktopAppendRecording(name, await ev.data.arrayBuffer());
          } catch (err) {
            this.writeError = (err as Error).message;
          }
        });
      } else {
        this.chunks.push(ev.data);
      }
    };
    this.startedAt = Date.now();
    this.rec.start(2000);
  }

  elapsedSec() {
    return this.active ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;
  }

  async stop(): Promise<RecordingResult> {
    const rec = this.rec;
    if (!rec) throw new Error('אין הקלטה פעילה');
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.stop();
    });
    this.rec = null;
    const durationSec = Math.round((Date.now() - this.startedAt) / 1000);
    if (isDesktop()) {
      await this.writeQueue;
      if (this.writeError) throw new Error(`שמירת ההקלטה לדיסק נכשלה: ${this.writeError}`);
      const done = await desktopFinishRecording(this.fileName);
      return { fileName: this.fileName, mime: this.mime, blob: null, path: done.path, size: done.size, durationSec };
    }
    const blob = new Blob(this.chunks, { type: this.mime.split(';')[0] });
    this.chunks = [];
    return { fileName: this.fileName, mime: blob.type, blob, path: null, size: blob.size, durationSec };
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
