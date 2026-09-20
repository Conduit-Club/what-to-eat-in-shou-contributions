import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRecordStore } from '../src/adapters/record-store.js';
import { FileAuditLog } from '../src/adapters/file-audit-log.js';
import { reviewSubmission } from '../src/domain/review.js';

const metadata = { schemaVersion: 1, name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '面条口感不错。', openingHours: '待补充', visitedAt: '2026-09-16', imageFilename: null };
const publicFields = { id: 'first-canteen', name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '同学反馈：面条口感不错。', openingHours: null, visitedAt: '2026-09-16', updatedAt: null, price: '待补充。', imageApproved: false };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'review-'));
  let counter = 0;
  const clock = { now: () => `2026-09-19T13:5${counter}:21.854Z` };
  const idGenerator = { randomId: () => `00000000-0000-4000-8000-${String(counter += 1).padStart(12, '0')}` };
  const repository = new FileRecordStore({ root, clock, idGenerator });
  const auditLog = new FileAuditLog({ root, idGenerator });
  return { repository, auditLog, clock, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('validates state, action and rejection reason before writing anything', async () => {
  const { repository, auditLog, clock, cleanup } = await fixture();
  try {
    const record = await repository.create(metadata, 'images/a.jpg');
    await assert.rejects(() => reviewSubmission({ repository, auditLog, clock, id: record.id, action: 'publish', reviewer: 'token:1', reason: null, publicFields: null }), (error) => error.status === 422 && error.code === 'invalid_action');
    await assert.rejects(() => reviewSubmission({ repository, auditLog, clock, id: record.id, action: 'reject', reviewer: 'token:1', reason: '   ', publicFields: null }), (error) => error.status === 422 && error.code === 'missing_rejection_reason');
    assert.equal((await auditLog.list()).length, 0, '校验失败不能留下审计');
    await reviewSubmission({ repository, auditLog, clock, id: record.id, action: 'approve', reviewer: 'token:1', reason: null, publicFields });
    await assert.rejects(() => reviewSubmission({ repository, auditLog, clock, id: record.id, action: 'approve', reviewer: 'token:1', reason: null, publicFields }), (error) => error.status === 409 && error.code === 'invalid_state');
  } finally { await cleanup(); }
});

test('writes the audit before recording the decision', async () => {
  const { repository, auditLog, clock, cleanup } = await fixture();
  try {
    const record = await repository.create(metadata, 'images/a.jpg');
    const reviewed = await reviewSubmission({ repository, auditLog, clock, id: record.id, action: 'reject', reviewer: 'token:2', reason: ' 重复投稿。 ', publicFields: null });
    assert.equal(reviewed.status, 'rejected');
    const audits = await auditLog.list();
    assert.equal(audits.length, 1);
    assert.deepEqual({ action: audits[0].action, reviewer: audits[0].reviewer, reason: audits[0].reason }, { action: 'reject', reviewer: 'token:2', reason: '重复投稿。' });
  } finally { await cleanup(); }
});
