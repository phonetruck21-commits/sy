import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual, hkdfSync } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// scrypt parameters: N=2^15, r=8, p=1 (~32MB RAM, OWASP-acceptable)
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, 32, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scryptAsync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 256-bit random token, URL safe. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(input: string): Buffer {
  return createHash('sha256').update(input).digest();
}

export class Keyring {
  readonly jwtKey: Uint8Array;
  private readonly encKey: Buffer;
  private readonly indexKey: Buffer;

  constructor(appSecret: string) {
    const ikm = Buffer.from(appSecret, 'utf8');
    const derive = (info: string) => Buffer.from(hkdfSync('sha256', ikm, Buffer.from('sy-live-service'), Buffer.from(info), 32));
    this.jwtKey = new Uint8Array(derive('jwt-hs256'));
    this.encKey = derive('field-encryption-aes256gcm');
    this.indexKey = derive('blind-index-hmac');
  }

  /** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url). */
  encrypt(plain: string | null | undefined): string | null {
    if (plain == null || plain === '') return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encKey, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
  }

  decrypt(payload: string | null | undefined): string | null {
    if (!payload) return null;
    const [v, ivB, tagB, ctB] = payload.split('.');
    if (v !== 'v1') throw new Error('Unsupported ciphertext version');
    const decipher = createDecipheriv('aes-256-gcm', this.encKey, Buffer.from(ivB, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** Deterministic keyed hash for equality lookups of encrypted fields. */
  blindIndex(value: string | null | undefined): Buffer | null {
    if (!value) return null;
    return createHmac('sha256', this.indexKey).update(value.trim().toLowerCase()).digest();
  }
}

/** Normalise Israeli phone numbers to digits only (e.g. +972-50-123-4567 -> 0501234567). */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return d || null;
}
