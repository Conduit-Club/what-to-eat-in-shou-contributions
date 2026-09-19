import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRecordStore } from '../src/adapters/record-store.js';

const metadata = { schemaVersion: 1, name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '面条口感不错。', openingHours: '待补充', visitedAt: '2026-09-16', imageFilename: null };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'records-'));
  let counter = 0;
  const store = new FileRecordStore({ root, randomId: () => `00000000-0000-4000-8000-${String(counter += 1).padStart(12, '0')}`, now: () => `2026-09-19T13:5${counter}:21.854Z` });
  return { root, store, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('keeps every submission in one directory with its status inside the record', async () => {
  const { root, store, cleanup } = await fixture();
  try {
    const record = await store.create(metadata, 'images/a.jpg');
    assert.deepEqual(JSON.parse(await readFile(join(root, 'records', `${record.id}.json`), 'utf8')).status, 'pending');
    assert.equal((await store.get(record.id)).imageKey, 'images/a.jpg');
    assert.equal((await store.list('pending')).length, 1);
    assert.equal((await store.list('approved')).length, 0);
    assert.equal('imageKey' in (await store.list('pending'))[0], false, '对外列表不能带私有图片键');
    await assert.rejects(() => store.get('not-a-uuid'), (error) => error.status === 404);
    await assert.rejects(() => store.get('00000000-0000-4000-8000-000000000999'), (error) => error.status === 404);
  } finally { await cleanup(); }
});

test('review rewrites the record in place and appends an audit entry', async () => {
  const { store, cleanup } = await fixture();
  try {
    const record = await store.create(metadata, 'images/a.jpg');
    const publicFields = { id: 'first-canteen', name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '同学反馈：面条口感不错。', openingHours: null, visitedAt: '2026-09-16', updatedAt: null, price: '待补充。', imageApproved: false };
    const reviewed = await store.review(record.id, 'approve', 'token:1', null, publicFields);
    assert.deepEqual({ status: reviewed.status, publicFields: reviewed.publicFields.id }, { status: 'approved', publicFields: 'first-canteen' });
    assert.equal((await store.list('pending')).length, 0);
    assert.equal((await store.list('approved')).length, 1);
    assert.equal((await store.list()).length, 1, '不传状态时返回全部投稿');
    const audits = await store.listAudits();
    assert.deepEqual(audits.map((audit) => ({ action: audit.action, reviewer: audit.reviewer, reason: audit.reason, submissionId: audit.submissionId })), [{ action: 'approve', reviewer: 'token:1', reason: null, submissionId: record.id }]);
  } finally { await cleanup(); }
});

test('refuses a rejection without a reason, an unknown action and a second review', async () => {
  const { store, cleanup } = await fixture();
  try {
    const record = await store.create(metadata, 'images/a.jpg');
    await assert.rejects(() => store.review(record.id, 'reject', 'token:1', '   ', null), (error) => error.status === 422 && error.code === 'missing_rejection_reason');
    await assert.rejects(() => store.review(record.id, 'publish', 'token:1', null, null), (error) => error.status === 422 && error.code === 'invalid_action');
    assert.equal((await store.listAudits()).length, 0, '被拒绝的请求不能留下审计');
    await store.review(record.id, 'reject', 'token:1', '重复投稿。', null);
    await assert.rejects(() => store.review(record.id, 'approve', 'token:1', null, {}), (error) => error.status === 409 && error.code === 'invalid_state');
  } finally { await cleanup(); }
});
