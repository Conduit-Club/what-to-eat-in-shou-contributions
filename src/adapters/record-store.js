import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { HttpError } from '../errors.js';
import { publicRecord } from '../domain/record.js';
import { SystemClock } from './system-clock.js';
import { CryptoIdGenerator } from './crypto-id-generator.js';

export { publicRecord } from '../domain/record.js';

/**
 * RecordStore 端口的默认实现：`<root>/records/<投稿 ID>.json`。
 * 状态写在记录里，审核只是改一个文件的内容，没有「搬到一半」的中间态。
 * 审计由独立的 FileAuditLog 负责，不在本类里写。
 */
export class FileRecordStore {
  constructor({ root, clock = new SystemClock(), idGenerator = new CryptoIdGenerator() }) {
    this.root = resolve(root);
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  #recordsDir() { return join(this.root, 'records'); }
  #recordPath(id) { return join(this.#recordsDir(), `${id}.json`); }

  async #write(path, value) {
    await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  }

  async #read(id) {
    if (!/^[0-9a-fA-F-]{36}$/.test(String(id))) throw new HttpError(404, 'not_found', '投稿不存在。');
    try { return JSON.parse(await readFile(this.#recordPath(id), 'utf8')); } catch { throw new HttpError(404, 'not_found', '投稿不存在。'); }
  }

  async create(metadata, imageKey) {
    const createdAt = this.clock.now();
    const record = { id: this.idGenerator.randomId(), metadata, imageKey, status: 'pending', publicFields: null, createdAt, updatedAt: createdAt };
    await this.#write(this.#recordPath(record.id), record);
    return record;
  }

  async get(id) { return this.#read(id); }

  async list(status) {
    return (await this.listRecords(status)).map(publicRecord);
  }

  /** 完整记录列表（含 imageKey），只给可信内部消费者（导出管线）使用。 */
  async listRecords(status) {
    const files = await readdir(this.#recordsDir()).catch(() => []);
    const records = [];
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const record = JSON.parse(await readFile(join(this.#recordsDir(), file), 'utf8'));
      if (!status || record.status === status) records.push(record);
    }
    return records.sort((left, right) => (left.createdAt < right.createdAt ? -1 : 1));
  }

  /** 只负责持久化；审核校验与审计顺序由 domain/review.js 负责。 */
  async review(id, action, reviewer, reason, publicFields, reviewedAt = this.clock.now()) {
    const record = await this.#read(id);
    const reviewed = { ...record, status: action === 'approve' ? 'approved' : 'rejected', publicFields: publicFields ?? null, updatedAt: reviewedAt };
    await this.#write(this.#recordPath(id), reviewed);
    return reviewed;
  }
}
