import { HttpError } from '../../errors.js';
import { publicRecord } from '../../domain/record.js';
import { SystemClock } from '../system-clock.js';
import { CryptoIdGenerator } from '../crypto-id-generator.js';

const UUID_PATTERN = /^[0-9a-fA-F-]{36}$/;

function rowToRecord(row) {
  return {
    id: row.id,
    metadata: JSON.parse(row.metadata),
    imageKey: row.image_key,
    status: row.status,
    publicFields: row.public_fields ? JSON.parse(row.public_fields) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * RecordStore 端口的 Cloudflare D1 实现。
 * 依赖 Wrangler 注入的 D1Database 绑定：env.DB。
 */
export class D1RecordStore {
  constructor({ db, clock = new SystemClock(), idGenerator = new CryptoIdGenerator() }) {
    this.db = db;
    this.clock = clock;
    this.idGenerator = idGenerator;
  }

  async create(metadata, imageKey) {
    const id = this.idGenerator.randomId();
    const createdAt = this.clock.now();
    await this.db.prepare(
      'INSERT INTO submissions (id, metadata, image_key, status, public_fields, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    ).bind(id, JSON.stringify(metadata), imageKey ?? null, 'pending', null, createdAt, createdAt).run();
    return { id, metadata, imageKey, status: 'pending', publicFields: null, createdAt, updatedAt: createdAt };
  }

  async get(id) {
    if (!UUID_PATTERN.test(String(id))) throw new HttpError(404, 'not_found', '投稿不存在。');
    const row = await this.db.prepare('SELECT * FROM submissions WHERE id = ?1').bind(id).first();
    if (!row) throw new HttpError(404, 'not_found', '投稿不存在。');
    return rowToRecord(row);
  }

  async list(status) {
    return (await this.listRecords(status)).map(publicRecord);
  }

  async listRecords(status) {
    const sql = status
      ? 'SELECT * FROM submissions WHERE status = ?1 ORDER BY created_at ASC'
      : 'SELECT * FROM submissions ORDER BY created_at ASC';
    const statement = status ? this.db.prepare(sql).bind(status) : this.db.prepare(sql);
    const result = await statement.all();
    return (result.results || []).map(rowToRecord);
  }

  async review(id, action, reviewer, reason, publicFields, reviewedAt = this.clock.now()) {
    const status = action === 'approve' ? 'approved' : 'rejected';
    await this.db.prepare(
      'UPDATE submissions SET status = ?1, public_fields = ?2, updated_at = ?3 WHERE id = ?4',
    ).bind(status, publicFields ? JSON.stringify(publicFields) : null, reviewedAt, id).run();
    return this.get(id);
  }
}
