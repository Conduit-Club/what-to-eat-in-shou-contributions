import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { HttpError } from '../errors.js';

const contentTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * 私有原图存储：只写本地目录，键由服务端生成，绝不从投稿文件名派生。
 * 目录必须位于仓库外或已加入 .gitignore 的私有位置。
 */
export class PrivateImageStore {
  constructor({ root }) { this.root = resolve(root); }

  #path(key) {
    const target = resolve(this.root, String(key || ''));
    if (!target.startsWith(`${this.root}/`)) throw new HttpError(400, 'invalid_storage_key', '存储键无效。');
    return target;
  }

  /** image 来自 validateAndSanitizeImage，已经移除可移除的 EXIF。 */
  async put(image) {
    const key = `images/${randomUUID()}.${image.extension}`;
    const target = this.#path(key);
    await mkdir(join(target, '..'), { recursive: true, mode: 0o700 });
    await writeFile(target, image.buffer, { mode: 0o600 });
    return key;
  }

  async read(key) {
    // 键校验放在 try 之外：越界键要报 400，不能被下面的 404 兜底吞掉。
    const target = this.#path(key);
    try {
      return { buffer: await readFile(target), contentType: contentTypes[String(key).split('.').pop().toLowerCase()] || 'application/octet-stream' };
    } catch { throw new HttpError(404, 'not_found', '图片不存在。'); }
  }
}
