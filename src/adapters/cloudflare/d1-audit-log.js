import { CryptoIdGenerator } from '../crypto-id-generator.js';

/**
 * AuditLog 端口的 Cloudflare D1 实现，与 D1RecordStore 共用同一个 env.DB。
 */
export class D1AuditLog {
  constructor({ db, idGenerator = new CryptoIdGenerator() }) {
    this.db = db;
    this.idGenerator = idGenerator;
  }

  async append(entry) {
    const audit = { id: this.idGenerator.randomId(), ...entry };
    await this.db.prepare(
      'INSERT INTO audits (id, submission_id, action, reviewer, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    ).bind(audit.id, audit.submissionId, audit.action, audit.reviewer, audit.reason, audit.createdAt).run();
    return audit;
  }

  async list() {
    const result = await this.db.prepare('SELECT * FROM audits ORDER BY created_at ASC').all();
    return (result.results || []).map((row) => ({
      id: row.id,
      submissionId: row.submission_id,
      action: row.action,
      reviewer: row.reviewer,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }
}
