import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export class LocalPrivateStorage {
  constructor(root) { this.root = resolve(root); }
  async putPending(image) { const key = `pending/${randomUUID()}.${image.extension}`; const target = this.#resolveKey(key); await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, image.buffer, { mode: 0o600 }); return key; }
  async get(key) { return readFile(this.#resolveKey(key)); }
  #resolveKey(key) { const target = resolve(this.root, String(key || '')); if (!target.startsWith(`${this.root}/`)) throw new Error('Unsafe storage key'); return target; }
}
