import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { HttpError } from '../errors.js';

/**
 * 投稿记录仓储：一个数据目录，一个 records 目录，状态写在记录里。
 *
 *   <root>/records/<投稿 ID>.json   所有投稿，status 决定它处在哪个阶段
 *   <root>/audits/<时间>-<随机>.json 审核审计，只追加，不修改也不删除
 *
 * 状态不放在目录名里，所以审核只是改一个文件的内容，没有「搬到一半」的中间态。
 * 代价是列出待审要读完所有记录；校园投稿量下这是几十个文件，可以接受。
 */
export class FileRecordStore {
  constructor({ root, now = () => new Date().toISOString(), randomId = () => randomUUID() }) {
    this.root = resolve(root);
    this.now = now;
    this.randomId = randomId;
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
    const createdAt = this.now();
    const record = { id: this.randomId(), metadata, imageKey, status: 'pending', publicFields: null, createdAt, updatedAt: createdAt };
    await this.#write(this.#recordPath(record.id), record);
    return record;
  }

  async get(id) { return this.#read(id); }

  async list(status) {
    const files = await readdir(this.#recordsDir()).catch(() => []);
    const records = [];
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const record = JSON.parse(await readFile(join(this.#recordsDir(), file), 'utf8'));
      if (!status || record.status === status) records.push(record);
    }
    return records.sort((left, right) => (left.createdAt < right.createdAt ? -1 : 1)).map(publicRecord);
  }

  async review(id, action, reviewer, reason, publicFields) {
    const record = await this.#read(id);
    if (record.status !== 'pending') throw new HttpError(409, 'invalid_state', '该投稿已审核。');
    if (!['approve', 'reject'].includes(action)) throw new HttpError(422, 'invalid_action', 'action 必须为 approve 或 reject。');
    if (action === 'reject' && !reason?.trim()) throw new HttpError(422, 'missing_rejection_reason', '拒绝投稿时必须填写原因。');
    const reviewedAt = this.now();
    // 先写审计再改记录：审计是审核行为的凭据，宁可留下一条对应不上状态的记录，也不能反过来。
    await this.#write(join(this.root, 'audits', `${reviewedAt.replace(/:/g, '')}-${this.randomId()}.json`), { id: this.randomId(), submissionId: id, action, reviewer, reason: reason?.trim() || null, createdAt: reviewedAt });
    const reviewed = { ...record, status: action === 'approve' ? 'approved' : 'rejected', publicFields: publicFields ?? null, updatedAt: reviewedAt };
    await this.#write(this.#recordPath(id), reviewed);
    return reviewed;
  }

  async listAudits() {
    const files = await readdir(join(this.root, 'audits')).catch(() => []);
    const audits = [];
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      audits.push(JSON.parse(await readFile(join(this.root, 'audits', file), 'utf8')));
    }
    return audits.sort((left, right) => (left.createdAt < right.createdAt ? -1 : 1));
  }
}

export function publicRecord(record) { const { imageKey, ...safe } = record; return safe; }
