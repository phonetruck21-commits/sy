import { isDesktop } from './desktop';

const TOKEN_KEY = 'sy.sessionToken';
const SERVER_KEY = 'sy.serverUrl';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) */
  }
}

/** In the browser the API is same-origin. In the desktop app the server URL is configured by the user. */
export function apiBase(): string {
  if (isDesktop()) return (safeGet(SERVER_KEY) ?? '').replace(/\/$/, '');
  return '';
}
export function getServerUrl(): string {
  return safeGet(SERVER_KEY) ?? '';
}
export function setServerUrl(url: string) {
  safeSet(SERVER_KEY, url.trim().replace(/\/$/, ''));
}

export function getToken(): string | null {
  return safeGet(TOKEN_KEY);
}
export function setToken(token: string | null) {
  safeSet(TOKEN_KEY, token);
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; token?: string | null; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = opts.token === undefined ? getToken() : opts.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(apiBase() + path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: opts.signal });
  } catch {
    throw new ApiError(0, 'network', 'אין חיבור לשרת');
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token && token === getToken() && !path.startsWith('/api/view')) {
      setToken(null);
      window.dispatchEvent(new Event('sy:logout'));
    }
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `שגיאה ${res.status}`);
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ---- Types shared by pages ---------------------------------------------------
export interface Me {
  user: { id: string; email: string; fullName: string; role: 'owner' | 'admin' | 'technician' };
  tenant: { id: string; name: string; slug: string; retentionDays: number; isDemo: boolean };
  plan: { id: string; name: string; max_cameras: number; max_users: number; storage_quota_mb: number; max_concurrent_streams: number; max_viewers_per_stream: number };
}

export interface Job {
  id: string;
  job_number: number;
  customer_id: string | null;
  customer_name: string | null;
  device_type: string;
  device_details: string | null;
  issue_description: string;
  technician_id: string | null;
  technician_name: string | null;
  status_key: string;
  status_label: string;
  is_terminal: boolean;
  received_at: string;
  started_at: string | null;
  closed_at: string | null;
  parts_replaced: { name: string; qty: number; sku?: string }[];
  tech_notes: string | null;
  summary: string | null;
  consent_streaming_at: string | null;
  consent_recording_at: string | null;
  consent_method: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface JobDetail extends Job {
  customer: { id: string; fullName: string; phone: string | null; email: string | null } | null;
  history: { from_status: string | null; to_status: string; created_at: string; user_name: string | null }[];
  media: { id: string; kind: 'photo' | 'video'; mime: string; size_bytes: string; captured_at: string | null; created_at: string }[];
  shareLinks: { id: string; created_at: string; expires_at: string; revoked_at: string | null; max_viewers: number; has_pin: boolean; use_count: number; last_used_at: string | null }[];
  stream: { live: boolean; viewers: number };
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  isDemo: boolean;
}

export interface JobStatus {
  key: string;
  label: string;
  sort_order: number;
  is_terminal: boolean;
}
