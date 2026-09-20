import { HttpError } from '../../errors.js';
import { CryptoIdGenerator } from '../crypto-id-generator.js';

const KEY_PATTERN = /^images\/[0-9a-fA-F-]{36}\.(jpg|png|webp)$/;
const contentTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/**
 * ImageStore 端口的 Cloudflare R2 实现。
 * 依赖 Wrangler 注入的 R2Bucket 绑定：env.IMAGES。
 */
export class R2ImageStore {
  constructor({ bucket, idGenerator = new CryptoIdGenerator() }) {
    this.bucket = bucket;
    this.idGenerator = idGenerator;
  }

  async put(image) {
    const key = `images/${this.idGenerator.randomId()}.${image.extension}`;
    await this.bucket.put(key, image.buffer, { httpMetadata: { contentType: contentTypes[image.extension] } });
    return key;
  }

  async read(key) {
    if (!KEY_PATTERN.test(String(key))) throw new HttpError(400, 'invalid_storage_key', '存储键无效。');
    const object = await this.bucket.get(key);
    if (object === null || object === undefined) throw new HttpError(404, 'not_found', '图片不存在。');
    const buffer = Buffer.from(await object.arrayBuffer());
    const contentType = object.httpMetadata?.contentType || contentTypes[String(key).split('.').pop().toLowerCase()] || 'application/octet-stream';
    return { buffer, contentType };
  }
}
