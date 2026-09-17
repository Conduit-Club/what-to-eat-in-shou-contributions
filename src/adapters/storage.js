import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export class LocalPrivateStorage {
  constructor(root) { this.root = resolve(root); }
  async putPending(image) { const key = `pending/${randomUUID()}.${image.extension}`; const target = resolve(this.root, key); if (!target.startsWith(`${this.root}/`)) throw new Error('Unsafe storage key'); await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, image.buffer, { mode: 0o600 }); return key; }
}
