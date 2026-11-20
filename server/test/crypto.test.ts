import { describe, expect, it } from 'vitest';
import { Keyring, hashPassword, normalizePhone, verifyPassword } from '../src/lib/crypto.js';

describe('crypto', () => {
  const k = new Keyring('x'.repeat(40));
  it('encrypts and decrypts with AES-GCM, random IV', () => {
    const a = k.encrypt('0501234567')!;
    const b = k.encrypt('0501234567')!;
    expect(a).not.toEqual(b);
    expect(k.decrypt(a)).toBe('0501234567');
  });
  it('detects tampering', () => {
    const a = k.encrypt('secret')!;
    const parts = a.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => k.decrypt(parts.join('.'))).toThrow();
  });
  it('different master secret cannot decrypt', () => {
    const a = k.encrypt('secret')!;
    expect(() => new Keyring('y'.repeat(40)).decrypt(a)).toThrow();
  });
  it('blind index is deterministic and keyed', () => {
    expect(k.blindIndex('abc')!.equals(k.blindIndex('ABC ')!)).toBe(true);
    expect(k.blindIndex('abc')!.equals(new Keyring('y'.repeat(40)).blindIndex('abc')!)).toBe(false);
  });
  it('hashes passwords with scrypt', async () => {
    const h = await hashPassword('correct horse battery');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
  it('normalises Israeli phone numbers', () => {
    expect(normalizePhone('+972-50-123-4567')).toBe('0501234567');
    expect(normalizePhone('050 123 4567')).toBe('0501234567');
  });
});
