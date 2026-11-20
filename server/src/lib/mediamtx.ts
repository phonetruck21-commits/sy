/** Thin client for the MediaMTX control API (v3). The API is only reachable on the internal network. */
export interface PathInfo {
  name: string;
  ready: boolean;
  readyTime: string | null;
  readers: { type: string; id: string }[];
  tracks: string[];
  bytesReceived: number;
  bytesSent: number;
}

export class MediaMtxClient {
  constructor(private readonly apiUrl: string) {}

  async getPath(name: string): Promise<PathInfo | null> {
    try {
      const res = await fetch(`${this.apiUrl}/v3/paths/get/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(2000) });
      if (res.status === 404) return null;
      if (!res.ok) return null;
      // Field names changed across MediaMTX versions (ready->online, bytesReceived->inboundBytes); accept both.
      const body = (await res.json()) as Record<string, any>;
      return {
        name: body.name ?? name,
        ready: Boolean(body.online ?? body.ready),
        readyTime: body.onlineTime ?? body.readyTime ?? null,
        readers: body.readers ?? [],
        tracks: (body.tracks2 ?? []).map((t: { codec: string }) => t.codec).concat(body.tracks2 ? [] : body.tracks ?? []),
        bytesReceived: body.inboundBytes ?? body.bytesReceived ?? 0,
        bytesSent: body.outboundBytes ?? body.bytesSent ?? 0,
      };
    } catch {
      return null;
    }
  }

  async listPaths(): Promise<PathInfo[]> {
    const res = await fetch(`${this.apiUrl}/v3/paths/list?itemsPerPage=1000`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`MediaMTX API ${res.status}`);
    const body = (await res.json()) as { items: PathInfo[] };
    return body.items ?? [];
  }

  /** Disconnect the publisher of a path (used when a job is closed or stream force-stopped). */
  async kickPublisher(name: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/v3/webrtcsessions/list?itemsPerPage=1000`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as { items: { id: string; path: string; state: string }[] };
    for (const s of body.items ?? []) {
      if (s.path === name) {
        await fetch(`${this.apiUrl}/v3/webrtcsessions/kick/${s.id}`, { method: 'POST', signal: AbortSignal.timeout(3000) }).catch(() => undefined);
      }
    }
  }

  async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/v3/paths/list?itemsPerPage=1`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }
}
