/**
 * Camera & microphone handling via standard Web APIs (Media Capture).
 * On Windows these map to Media Foundation / UVC. We only expose controls that the browser
 * reports in MediaStreamTrack.getCapabilities() for the actual device - nothing is assumed.
 */

export interface Resolution {
  width: number;
  height: number;
  label: string;
}

export const RESOLUTIONS: Resolution[] = [
  { width: 3840, height: 2160, label: '4K (3840×2160)' },
  { width: 2560, height: 1440, label: '1440p (2560×1440)' },
  { width: 1920, height: 1080, label: '1080p (1920×1080)' },
  { width: 1280, height: 720, label: '720p (1280×720)' },
  { width: 640, height: 480, label: '480p (640×480)' },
];

export interface StreamProfile {
  id: string;
  label: string;
  height: number;
  maxBitrateKbps: number;
}

/** Stream quality is independent of capture resolution: we can record 4K locally and stream 1080p. */
export const STREAM_PROFILES: StreamProfile[] = [
  { id: '1080p', label: '1080p – איכות גבוהה (≈3 Mbps)', height: 1080, maxBitrateKbps: 3000 },
  { id: '720p', label: '720p – מאוזן (≈1.5 Mbps)', height: 720, maxBitrateKbps: 1500 },
  { id: '480p', label: '480p – רשת חלשה (≈0.7 Mbps)', height: 480, maxBitrateKbps: 700 },
];

export interface DeviceLists {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}

/** Ask once for permission so that enumerateDevices() returns labels. */
export async function ensurePermission(): Promise<{ video: boolean; audio: boolean }> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('הדפדפן אינו תומך בגישה למצלמה (נדרש HTTPS או localhost)');
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    s.getTracks().forEach((t) => t.stop());
    return { video: true, audio: true };
  } catch {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
    return { video: true, audio: false };
  }
}

export async function listDevices(): Promise<DeviceLists> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === 'videoinput' && d.deviceId),
    mics: all.filter((d) => d.kind === 'audioinput' && d.deviceId),
  };
}

export function isEmeetPixy(label: string | undefined): boolean {
  return !!label && /emeet|pixy/i.test(label);
}

export interface OpenOptions {
  cameraId?: string;
  micId?: string | null; // null = no audio
  width: number;
  height: number;
  fps: number;
}

export async function openCamera(o: OpenOptions): Promise<MediaStream> {
  const video: MediaTrackConstraints & Record<string, unknown> = {
    deviceId: o.cameraId ? { exact: o.cameraId } : undefined,
    width: { ideal: o.width },
    height: { ideal: o.height },
    frameRate: { ideal: o.fps },
  };
  const audio: MediaTrackConstraints | false = o.micId === null ? false : { deviceId: o.micId ? { exact: o.micId } : undefined, echoCancellation: true, noiseSuppression: true };
  // Chrome/Edge expose motorised pan/tilt/zoom (UVC PTZ, e.g. EMEET PIXY) ONLY when the page asks for it
  // when opening the camera. Cameras without PTZ simply ignore these constraints.
  const ptz = { ...video, pan: true, tilt: true, zoom: true };
  try {
    return await navigator.mediaDevices.getUserMedia({ video: ptz, audio });
  } catch {
    /* browser/camera rejected the PTZ request -> open normally below */
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio });
  } catch (err) {
    if (audio) {
      // Microphone busy/denied: continue with video only rather than failing the whole station
      const v = await navigator.mediaDevices.getUserMedia({ video });
      (v as MediaStream & { audioError?: string }).audioError = (err as Error).message;
      return v;
    }
    throw err;
  }
}

export interface ControlInfo {
  name: string;
  label: string;
  type: 'range' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  value: number | string | undefined;
}

const CONTROL_LABELS: Record<string, string> = {
  zoom: 'זום',
  pan: 'הזזה אופקית (Pan)',
  tilt: 'הטיה (Tilt)',
  focusMode: 'מצב פוקוס',
  focusDistance: 'מרחק פוקוס',
  brightness: 'בהירות',
  contrast: 'ניגודיות',
  sharpness: 'חדות',
  saturation: 'רוויה',
  exposureMode: 'מצב חשיפה',
  whiteBalanceMode: 'איזון לבן',
};

/** Returns supported capture resolutions and the controls the device *actually* exposes. */
export function describeTrack(track: MediaStreamTrack) {
  const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & Record<string, unknown>;
  const settings = track.getSettings() as MediaTrackSettings & Record<string, unknown>;
  const maxW = (caps.width as ULongRange | undefined)?.max ?? settings.width ?? 1920;
  const maxH = (caps.height as ULongRange | undefined)?.max ?? settings.height ?? 1080;
  const maxFps = (caps.frameRate as DoubleRange | undefined)?.max ?? settings.frameRate ?? 30;
  const resolutions = RESOLUTIONS.filter((r) => r.width <= maxW && r.height <= maxH);
  const controls: ControlInfo[] = [];
  for (const name of Object.keys(CONTROL_LABELS)) {
    const c = caps[name] as unknown;
    if (c == null) continue;
    if (Array.isArray(c)) {
      if (c.length > 1) controls.push({ name, label: CONTROL_LABELS[name], type: 'select', options: c as string[], value: settings[name] as string });
    } else if (typeof c === 'object' && 'min' in (c as object) && 'max' in (c as object)) {
      const r = c as { min: number; max: number; step?: number };
      if (r.max > r.min) controls.push({ name, label: CONTROL_LABELS[name], type: 'range', min: r.min, max: r.max, step: r.step || (r.max - r.min) / 100, value: settings[name] as number });
    }
  }
  return {
    resolutions,
    maxFps: Math.round(maxFps),
    actual: { width: settings.width, height: settings.height, fps: settings.frameRate ? Math.round(settings.frameRate) : undefined },
    controls,
  };
}

/** Pan/tilt/zoom capabilities of the track, if the camera reports motorised PTZ. */
export function ptzCapabilities(track: MediaStreamTrack) {
  const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
  const settings = track.getSettings() as Record<string, unknown>;
  const range = (n: string) => {
    const c = caps[n] as { min: number; max: number; step?: number } | undefined;
    return c && typeof c.min === 'number' && c.max > c.min ? { ...c, value: (settings[n] as number) ?? c.min } : null;
  };
  const pan = range('pan');
  const tilt = range('tilt');
  const zoom = range('zoom');
  return pan || tilt || zoom ? { pan, tilt, zoom } : null;
}

export async function applyControl(track: MediaStreamTrack, name: string, value: number | string): Promise<void> {
  await track.applyConstraints({ advanced: [{ [name]: value } as MediaTrackConstraintSet] });
}

/** Grab a full-resolution still frame from a live video element as JPEG. */
export async function captureStill(video: HTMLVideoElement, quality = 0.92): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const g = canvas.getContext('2d');
  if (!g || !canvas.width) throw new Error('אין תמונה מהמצלמה');
  g.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('צילום נכשל'))), 'image/jpeg', quality));
}
