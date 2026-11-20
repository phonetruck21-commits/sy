/**
 * Bridge to the Tauri desktop shell (Windows). In a normal browser every function
 * degrades gracefully, so the same UI runs in Chrome/Edge for testing.
 */
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
}

async function invoke<T>(cmd: string, args?: unknown, options?: { headers: Record<string, string> }): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args as never, options);
}

/** Appends a chunk of a recording to a file in the local recordings folder (streamed to disk). */
export async function desktopAppendRecording(fileName: string, chunk: ArrayBuffer): Promise<void> {
  await invoke('recording_append', new Uint8Array(chunk), { headers: { 'x-file-name': encodeURIComponent(fileName) } });
}

export async function desktopFinishRecording(fileName: string): Promise<{ path: string; size: number }> {
  return invoke('recording_finish', { fileName });
}

export async function desktopOpenRecordingsFolder(): Promise<void> {
  await invoke('open_recordings_folder');
}

export async function desktopInfo(): Promise<{ version: string; recordingsDir: string; hostname: string } | null> {
  if (!isDesktop()) return null;
  return invoke('app_info');
}
