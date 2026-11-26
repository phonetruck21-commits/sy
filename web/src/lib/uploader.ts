/**
 * Resumable chunked upload client (server: /api/jobs/:id/uploads, /api/uploads/:id).
 * Safe to call again after a crash, a closed app or a network drop: the server keeps the
 * bytes already received and tells us where to continue (same clientId -> same upload).
 */
import { ApiError, api, apiBase, getToken } from './api';

export interface ResumableSource {
  jobId: string;
  clientId: string;
  mime: string;
  size: number;
  capturedAt?: string;
  readChunk: (offset: number, length: number) => Promise<ArrayBuffer>;
}

interface UploadState {
  id: string;
  received: number;
  totalSize: number;
  completed: boolean;
  mediaId: string | null;
  chunkSize: number;
}

async function putChunk(id: string, offset: number, data: ArrayBuffer): Promise<number> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/uploads/${id}?offset=${offset}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/octet-stream' },
      body: data,
    });
  } catch {
    throw new ApiError(0, 'network', 'אין חיבור לשרת');
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 409 && body.error === 'offset_mismatch') return body.details.received as number; // resync
  if (!res.ok) throw new ApiError(res.status, body.error ?? 'error', body.message ?? `שגיאה ${res.status}`);
  return body.received as number;
}

export async function uploadResumable(src: ResumableSource, onProgress?: (fraction: number) => void): Promise<{ mediaId: string }> {
  const state = await api<UploadState>(`/api/jobs/${src.jobId}/uploads`, {
    body: { mime: src.mime.split(';')[0], size: src.size, clientId: src.clientId, capturedAt: src.capturedAt },
  });
  if (state.completed && state.mediaId) return { mediaId: state.mediaId };
  let offset = state.received;
  onProgress?.(offset / src.size);
  while (offset < src.size) {
    const data = await src.readChunk(offset, Math.min(state.chunkSize, src.size - offset));
    if (!data.byteLength) throw new Error('קריאת הקובץ המקומי נכשלה');
    offset = await putChunk(state.id, offset, data);
    onProgress?.(offset / src.size);
  }
  const done = await api<{ mediaId: string }>(`/api/uploads/${state.id}/complete`, { method: 'POST' });
  return { mediaId: done.mediaId };
}
