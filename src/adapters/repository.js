import { randomUUID } from 'node:crypto';
import { HttpError } from '../errors.js';

export class MemoryRepository {
  constructor() { this.submissions = new Map(); this.audits = []; }
  async create(metadata, imageKey) { const now = new Date().toISOString(); const record = { id: randomUUID(), metadata, imageKey, status: 'pending', createdAt: now, updatedAt: now }; this.submissions.set(record.id, record); return record; }
  async list(status) { return [...this.submissions.values()].filter((record) => !status || record.status === status).map(publicRecord); }
  async get(id) { const record = this.submissions.get(id); if (!record) throw new HttpError(404, 'not_found', '投稿不存在。'); return record; }
  async review(id, action, reviewer, reason, publicFields) { const record = await this.get(id); if (record.status !== 'pending') throw new HttpError(409, 'invalid_state', '该投稿已审核。'); if (!['approve', 'reject'].includes(action)) throw new HttpError(422, 'invalid_action', 'action 必须为 approve 或 reject。'); if (action === 'reject' && !reason?.trim()) throw new HttpError(422, 'missing_rejection_reason', '拒绝投稿时必须填写原因。'); record.status = action === 'approve' ? 'approved' : 'rejected'; record.publicFields = publicFields ?? null; record.updatedAt = new Date().toISOString(); this.audits.push({ id: randomUUID(), submissionId: id, action, reviewer, reason: reason?.trim() || null, createdAt: record.updatedAt }); return record; }
}

export function publicRecord(record) { const { imageKey, ...safe } = record; return safe; }
