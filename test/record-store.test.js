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
  const clock = { now: () => `2026-09-19T13:5${counter}:21.854Z` };
  const idGenerator = { randomId: () => `00000000-0000-4000-8000-${String(counter += 1).padStart(12, '0')}` };
  const store = new FileRecordStore({ root, clock, idGenerator });
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

test('review rewrites the record in place without touching audit storage', async () => {
  const { store, cleanup } = await fixture();
  try {
    const record = await store.create(metadata, 'images/a.jpg');
    const publicFields = { id: 'first-canteen', name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '同学反馈：面条口感不错。', openingHours: null, visitedAt: '2026-09-16', updatedAt: null, price: '待补充。', imageApproved: false };
    const reviewed = await store.review(record.id, 'approve', 'token:1', null, publicFields, '2026-09-19T13:51:21.854Z');
    assert.deepEqual({ status: reviewed.status, publicFields: reviewed.publicFields.id }, { status: 'approved', publicFields: 'first-canteen' });
    assert.equal((await store.list('pending')).length, 0);
    assert.equal((await store.list('approved')).length, 1);
    assert.equal((await store.list()).length, 1, '不传状态时返回全部投稿');
  } finally { await cleanup(); }
});
