import { createReadStream, createWriteStream } from 'node:fs';
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';

/**
 * Storage abstraction. Phase 1 ships the local-disk driver; an S3-compatible driver
 * (MinIO / Wasabi / AWS) can implement the same interface without touching routes.
 */
export interface MediaStorage {
  put(key: string, data: Readable, maxBytes: number): Promise<{ size: number; sha256: string }>;
  get(key: string): Promise<{ stream: Readable; size: number }>;
  delete(key: string): Promise<void>;
  /** Appends bytes to a temporary upload object (resumable uploads). */
  appendPart(uploadKey: string, data: Buffer): Promise<number>;
  /** Moves a finished upload to its final key and returns its size and SHA-256. */
  finalizePart(uploadKey: string, finalKey: string): Promise<{ size: number; sha256: string }>;
  partSize(uploadKey: string): Promise<number>;
}

export class StorageLimitError extends Error {}

export class LocalStorage implements MediaStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!/^[A-Za-z0-9/_.-]+$/.test(key) || key.includes('..')) throw new Error('invalid storage key');
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('invalid storage key');
    return full;
  }

  async put(key: string, data: Readable, maxBytes: number) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    const hash = createHash('sha256');
    let size = 0;
    data.on('data', (chunk: Buffer) => {
      size += chunk.length;
      hash.update(chunk);
      if (size > maxBytes) data.destroy(new StorageLimitError('file too large'));
    });
    try {
      await pipeline(data, createWriteStream(full, { flags: 'wx', mode: 0o640 }));
    } catch (err) {
      await rm(full, { force: true });
      throw err;
    }
    return { size, sha256: hash.digest('hex') };
  }

  async get(key: string) {
    const full = this.resolve(key);
    const s = await stat(full);
    return { stream: createReadStream(full), size: s.size };
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async appendPart(uploadKey: string, data: Buffer) {
    const full = this.resolve(uploadKey);
    await mkdir(path.dirname(full), { recursive: true });
    await appendFile(full, data, { mode: 0o640 });
    return (await stat(full)).size;
  }

  async partSize(uploadKey: string) {
    try {
      return (await stat(this.resolve(uploadKey))).size;
    } catch {
      return 0;
    }
  }

  async finalizePart(uploadKey: string, finalKey: string) {
    const src = this.resolve(uploadKey);
    const dst = this.resolve(finalKey);
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of createReadStream(src)) {
      hash.update(chunk as Buffer);
      size += (chunk as Buffer).length;
    }
    await mkdir(path.dirname(dst), { recursive: true });
    await rename(src, dst);
    return { size, sha256: hash.digest('hex') };
  }
}
