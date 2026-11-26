/**
 * Local persistence (IndexedDB) for offline work:
 *  - outbox: photos/recordings waiting to be uploaded to the server (synced when online)
 *  - recordings: browser-mode local copies of recordings (desktop mode writes to disk instead)
 */
import { api, getToken } from './api';
import { desktopReadChunk, desktopRecordingSize } from './desktop';
import { uploadResumable } from './uploader';

const DB_NAME = 'sy-live';
const DB_VERSION = 1;

export interface OutboxItem {
  id: string; // also used as idempotency key (clientId) on the server
  jobId: string;
  jobNumber?: number;
  kind: 'photo' | 'video';
  mime: string;
  /** Browser mode: the file itself. */
  blob?: Blob;
  /** Desktop mode: name of the recording in the local recordings folder (read back in chunks). */
  desktopFile?: string;
  capturedAt: string;
  attempts: number;
  lastError?: string;
}

export interface LocalRecording {
  id: string;
  jobId: string | null;
  jobNumber?: number;
  fileName: string;
  mime: string;
  blob: Blob;
  createdAt: string;
  durationSec: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const outbox = {
  add: (item: OutboxItem) => tx('outbox', 'readwrite', (s) => s.put(item)),
  all: () => tx<OutboxItem[]>('outbox', 'readonly', (s) => s.getAll() as IDBRequest<OutboxItem[]>),
  remove: (id: string) => tx('outbox', 'readwrite', (s) => s.delete(id)),
};

export const localRecordings = {
  add: (r: LocalRecording) => tx('recordings', 'readwrite', (s) => s.put(r)),
  all: () => tx<LocalRecording[]>('recordings', 'readonly', (s) => s.getAll() as IDBRequest<LocalRecording[]>),
  remove: (id: string) => tx('recordings', 'readwrite', (s) => s.delete(id)),
};

let syncing = false;

/** Uploads pending items. Safe to call often; the server de-duplicates by clientId. */
export async function syncOutbox(onChange?: (pending: number) => void, onProgress?: (item: OutboxItem, fraction: number) => void): Promise<{ uploaded: number; pending: number }> {
  if (syncing || !getToken()) return { uploaded: 0, pending: (await outbox.all().catch(() => [])).length };
  syncing = true;
  let uploaded = 0;
  try {
    const items = await outbox.all();
    for (const item of items) {
      if (!navigator.onLine) break;
      if (item.attempts >= 99) continue; // permanently rejected – kept locally, not retried
      try {
        if (item.kind === 'video' || item.desktopFile) {
          // Recordings: resumable chunked upload (survives drops; continues where it stopped)
          const size = item.desktopFile ? await desktopRecordingSize(item.desktopFile) : item.blob!.size;
          await uploadResumable(
            {
              jobId: item.jobId,
              clientId: item.id,
              mime: item.mime,
              size,
              capturedAt: item.capturedAt,
              readChunk: item.desktopFile
                ? (offset, length) => desktopReadChunk(item.desktopFile!, offset, length)
                : (offset, length) => item.blob!.slice(offset, offset + length).arrayBuffer(),
            },
            (f) => onProgress?.(item, f),
          );
        } else {
          const form = new FormData();
          const ext = item.mime.includes('png') ? 'png' : item.mime.includes('jpeg') ? 'jpg' : 'webp';
          form.append('file', new File([item.blob!], `${item.kind}-${item.id}.${ext}`, { type: item.mime }));
          await api(`/api/jobs/${item.jobId}/media?clientId=${encodeURIComponent(item.id)}&capturedAt=${encodeURIComponent(item.capturedAt)}`, { method: 'POST', form });
        }
        await outbox.remove(item.id);
        uploaded++;
      } catch (err) {
        const status = (err as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
          // permanent rejection (consent missing, quota, type) – keep locally but stop retrying
          await outbox.add({ ...item, attempts: 99, lastError: (err as Error).message });
        } else {
          await outbox.add({ ...item, attempts: item.attempts + 1, lastError: (err as Error).message });
          break; // network/server issue – try later
        }
      }
    }
  } finally {
    syncing = false;
  }
  const pending = (await outbox.all()).filter((i) => i.attempts < 99).length;
  onChange?.(pending);
  return { uploaded, pending };
}

export function newId(): string {
  return crypto.randomUUID();
}
