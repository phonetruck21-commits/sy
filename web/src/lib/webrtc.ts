/**
 * WHIP (publish) and WHEP (play) clients with automatic reconnection.
 * Signalling goes over HTTPS to our API (which proxies to MediaMTX); media flows over
 * DTLS-SRTP (always encrypted in WebRTC). The technician PC only makes outbound connections.
 */
import { apiBase } from './api';

export type ConnState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'offline' | 'failed' | 'stopped';

export interface Credentials {
  url: string; // e.g. /api/stream/<path>/whip
  token: string;
  iceServers: RTCIceServer[];
}

export class SignallingError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function waitIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(t);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === 'complete') done();
    }
    pc.addEventListener('icegatheringstatechange', check);
  });
}

async function postOffer(cred: Credentials, sdp: string): Promise<{ answer: string; location: string | null }> {
  let res: Response;
  try {
    res = await fetch(apiBase() + cred.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${cred.token}` },
      body: sdp,
    });
  } catch {
    throw new SignallingError(0, 'אין חיבור לשרת');
  }
  if (!res.ok) {
    let message = `שגיאת שרת ${res.status}`;
    try {
      message = (await res.json()).message ?? message;
    } catch {
      /* ignore */
    }
    throw new SignallingError(res.status, message);
  }
  return { answer: await res.text(), location: res.headers.get('Location') };
}

function deleteResource(location: string | null, token: string) {
  if (!location) return;
  fetch(apiBase() + location, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => undefined);
}

function preferCodec(transceiver: RTCRtpTransceiver, mime: string) {
  const caps = RTCRtpSender.getCapabilities?.('video');
  if (!caps || !transceiver.setCodecPreferences) return;
  const preferred = caps.codecs.filter((c) => c.mimeType.toLowerCase() === mime.toLowerCase());
  if (!preferred.length) return; // e.g. no H264 encoder available -> browser default (VP8)
  const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== mime.toLowerCase());
  transceiver.setCodecPreferences([...preferred, ...rest]);
}

interface BaseOptions {
  getCredentials: () => Promise<Credentials>;
  onState: (s: ConnState, detail?: string) => void;
}

abstract class ReconnectingSession {
  protected pc: RTCPeerConnection | null = null;
  protected location: string | null = null;
  protected token = '';
  protected stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;

  constructor(protected readonly opts: BaseOptions) {}

  protected abstract setup(pc: RTCPeerConnection): void;
  /** HTTP statuses after which retrying is pointless (permission problems). */
  protected abstract fatal(status: number): boolean;
  protected offlineStatus(_status: number): boolean {
    return false;
  }

  start() {
    this.stopped = false;
    this.attempt = 0;
    void this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
    this.teardown();
    this.opts.onState('stopped');
  }

  stats(): Promise<RTCStatsReport | null> {
    return this.pc ? this.pc.getStats() : Promise.resolve(null);
  }

  private teardown() {
    deleteResource(this.location, this.token);
    this.location = null;
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
  }

  private scheduleRetry(state: ConnState, detail?: string) {
    if (this.stopped) return;
    this.teardown();
    const delay = state === 'offline' ? 4000 : Math.min(15000, 1000 * 2 ** this.attempt);
    this.attempt++;
    this.opts.onState(state, detail);
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  private async connect() {
    if (this.stopped) return;
    this.opts.onState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let cred: Credentials;
    try {
      cred = await this.opts.getCredentials();
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      if (status && this.fatal(status)) {
        this.stopped = true;
        this.opts.onState('failed', (err as Error).message);
        return;
      }
      return this.scheduleRetry('reconnecting', (err as Error).message);
    }
    if (this.stopped) return;
    this.token = cred.token;
    const pc = new RTCPeerConnection({ iceServers: cred.iceServers, bundlePolicy: 'max-bundle' });
    this.pc = pc;
    this.setup(pc);
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc || this.stopped) return;
      const s = pc.connectionState;
      if (s === 'connected') {
        this.attempt = 0;
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
        this.opts.onState('live');
      } else if (s === 'failed' || s === 'closed') {
        this.scheduleRetry('reconnecting', 'החיבור נותק');
      } else if (s === 'disconnected') {
        // transient network glitch: give ICE a few seconds to recover before rebuilding
        this.opts.onState('reconnecting', 'החיבור אינו יציב');
        if (this.disconnectTimer) clearTimeout(this.disconnectTimer);
        this.disconnectTimer = setTimeout(() => {
          if (this.pc === pc && pc.connectionState !== 'connected') this.scheduleRetry('reconnecting', 'החיבור נותק');
        }, 5000);
      }
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceGathering(pc, 2500);
      const { answer, location } = await postOffer(cred, pc.localDescription!.sdp);
      if (this.stopped || this.pc !== pc) {
        deleteResource(location, cred.token);
        return;
      }
      this.location = location;
      await pc.setRemoteDescription({ type: 'answer', sdp: answer });
      this.afterConnect(pc);
    } catch (err) {
      const status = err instanceof SignallingError ? err.status : 0;
      if (status && this.fatal(status)) {
        this.stopped = true;
        this.teardown();
        this.opts.onState('failed', (err as Error).message);
        return;
      }
      if (status && this.offlineStatus(status)) return this.scheduleRetry('offline', (err as Error).message);
      this.scheduleRetry('reconnecting', (err as Error).message);
    }
  }

  protected afterConnect(_pc: RTCPeerConnection) {}
}

export interface PublisherOptions extends BaseOptions {
  stream: MediaStream;
  maxBitrateKbps: number;
  /** Send resolution height (e.g. 1080) – capture may be higher (4K recording). */
  targetHeight: number;
}

export class WhipPublisher extends ReconnectingSession {
  constructor(private readonly p: PublisherOptions) {
    super(p);
  }

  protected fatal(status: number) {
    return status === 401 || status === 403 || status === 404 || status === 409 || status === 412;
  }

  protected setup(pc: RTCPeerConnection) {
    const video = this.p.stream.getVideoTracks()[0];
    const audio = this.p.stream.getAudioTracks()[0];
    if (video) {
      const h = video.getSettings().height ?? this.p.targetHeight;
      const scale = h > this.p.targetHeight ? h / this.p.targetHeight : 1;
      const tr = pc.addTransceiver(video, {
        direction: 'sendonly',
        streams: [this.p.stream],
        sendEncodings: [{ maxBitrate: this.p.maxBitrateKbps * 1000, scaleResolutionDownBy: scale, maxFramerate: 30 }],
      });
      // H264 plays natively on every phone (incl. older iPhones); falls back to VP8 automatically
      preferCodec(tr, 'video/H264');
    }
    if (audio) pc.addTransceiver(audio, { direction: 'sendonly', streams: [this.p.stream] });
  }

  protected afterConnect(pc: RTCPeerConnection) {
    // Keep detail sharp on repair work: when bandwidth drops prefer lowering frame rate over resolution
    for (const s of pc.getSenders()) {
      if (s.track?.kind !== 'video') continue;
      const params = s.getParameters();
      (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference = 'maintain-resolution';
      s.setParameters(params).catch(() => undefined);
    }
  }

  /** Hot-swap tracks (e.g. microphone change) without renegotiation. */
  async replaceTracks(stream: MediaStream) {
    this.p.stream = stream; // used on the next (re)connect
    if (!this.pc) return;
    for (const sender of this.pc.getSenders()) {
      const next = sender.track?.kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
      if (next) await sender.replaceTrack(next);
    }
  }
}

export interface PlayerOptions extends BaseOptions {
  onStream: (s: MediaStream) => void;
}

export class WhepPlayer extends ReconnectingSession {
  constructor(private readonly p: PlayerOptions) {
    super(p);
  }

  protected fatal(status: number) {
    return status === 401 || status === 403 || status === 410;
  }

  /** MediaMTX answers 404 when nobody is publishing yet; viewer limit is 429 – keep polling. */
  protected offlineStatus(status: number) {
    return status === 404 || status === 429 || status === 400;
  }

  protected setup(pc: RTCPeerConnection) {
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    const stream = new MediaStream();
    pc.ontrack = (ev) => {
      stream.addTrack(ev.track);
      this.p.onStream(stream);
    };
  }
}

/** Reads outbound/inbound video stats for the UI (bitrate, resolution, fps). */
export async function readVideoStats(report: RTCStatsReport | null, prev?: { bytes: number; ts: number }) {
  if (!report) return null;
  let out: { kbps: number; width?: number; height?: number; fps?: number; bytes: number; ts: number } | null = null;
  report.forEach((s) => {
    if ((s.type === 'outbound-rtp' || s.type === 'inbound-rtp') && s.kind === 'video') {
      const bytes = s.type === 'outbound-rtp' ? s.bytesSent : s.bytesReceived;
      const kbps = prev && s.timestamp > prev.ts ? ((bytes - prev.bytes) * 8) / (s.timestamp - prev.ts) : 0;
      out = { kbps: Math.max(0, Math.round(kbps)), width: s.frameWidth, height: s.frameHeight, fps: s.framesPerSecond, bytes, ts: s.timestamp };
    }
  });
  return out as { kbps: number; width?: number; height?: number; fps?: number; bytes: number; ts: number } | null;
}
