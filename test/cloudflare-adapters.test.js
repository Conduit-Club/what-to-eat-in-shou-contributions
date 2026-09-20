import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { D1RecordStore } from '../src/adapters/cloudflare/d1-record-store.js';
import { D1AuditLog } from '../src/adapters/cloudflare/d1-audit-log.js';
import { D1RateLimiter } from '../src/adapters/cloudflare/d1-rate-limiter.js';
import { R2ImageStore } from '../src/adapters/cloudflare/r2-image-store.js';
import { SystemClock } from '../src/adapters/system-clock.js';
import { CryptoIdGenerator } from '../src/adapters/crypto-id-generator.js';
import { reviewSubmission } from '../src/domain/review.js';
import worker from '../src/worker.js';

const schemaUrl = new URL('../migrations/0001_initial.sql', import.meta.url);
const metadata = { schemaVersion: 1, name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '面条口感不错。', openingHours: '待补充', visitedAt: '2026-09-16', imageFilename: 'client-name.png' };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

class FakeD1 {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new FakeD1Statement(this.sqlite, sql); }
}

class FakeD1Statement {
  constructor(sqlite, sql) { this.sqlite = sqlite; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  run() { const result = this.sqlite.prepare(this.sql).run(...this.params); return { results: [], meta: { changes: result.changes } }; }
  all() { return { results: this.sqlite.prepare(this.sql).all(...this.params) }; }
  first() {
    const rows = this.sqlite.prepare(this.sql).all(...this.params);
    return rows[0] ?? null;
  }
}

class FakeR2Bucket {
  constructor() { this.objects = new Map(); }
  async put(key, value, options) {
    this.objects.set(key, { buffer: Buffer.from(value), httpMetadata: options?.httpMetadata });
  }
  async get(key) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      arrayBuffer: async () => object.buffer.buffer.slice(object.buffer.byteOffset, object.buffer.byteOffset + object.buffer.byteLength),
      httpMetadata: object.httpMetadata,
    };
  }
}

async function createD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(await readFile(schemaUrl, 'utf8'));
  return new FakeD1(sqlite);
}

test('D1 record store persists submissions and review through domain use case', async () => {
  const db = await createD1();
  const clock = new SystemClock();
  const idGenerator = new CryptoIdGenerator();
  const repository = new D1RecordStore({ db, clock, idGenerator });
  const auditLog = new D1AuditLog({ db, idGenerator });

  const created = await repository.create(metadata, 'images/abc.jpg');
  assert.equal(created.status, 'pending');
  assert.equal((await repository.list('pending')).length, 1);
  assert.equal('imageKey' in (await repository.list('pending'))[0], false);

  const publicFields = { id: 'first-canteen', name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '同学反馈：面条口感不错。', openingHours: null, visitedAt: '2026-09-16', updatedAt: null, price: '待补充。', imageApproved: false };
  const reviewed = await reviewSubmission({ repository, auditLog, clock, id: created.id, action: 'approve', reviewer: 'token:1', reason: null, publicFields });
  assert.equal(reviewed.status, 'approved');
  assert.equal((await auditLog.list()).length, 1);
});

test('D1 rate limiter throws after the window quota is exhausted', async () => {
  const db = await createD1();
  let now = 1000;
  const limiter = new D1RateLimiter({ db, windowMs: 60_000, max: 1, now: () => now });
  await limiter.enforce('127.0.0.1');
  await assert.rejects(() => limiter.enforce('127.0.0.1'), (error) => error.status === 429 && error.code === 'rate_limited');
  now += 60_001;
  await limiter.enforce('127.0.0.1');
});

test('R2 image store puts and reads private images with a server-generated key', async () => {
  const bucket = new FakeR2Bucket();
  const storage = new R2ImageStore({ bucket, idGenerator: new CryptoIdGenerator() });
  const key = await storage.put({ buffer: jpeg, extension: 'jpg' });
  assert.match(key, /^images\/[0-9a-f-]{36}\.jpg$/);
  const read = await storage.read(key);
  assert.equal(Buffer.from(read.buffer).toString('hex'), jpeg.toString('hex'));
  assert.equal(read.contentType, 'image/jpeg');
  await assert.rejects(() => storage.read('../outside.jpg'), (error) => error.status === 400 && error.code === 'invalid_storage_key');
});

test('worker fetch serves submission, admin list, image and review from Cloudflare adapters', async () => {
  const db = await createD1();
  const env = {
    DB: db,
    IMAGES: new FakeR2Bucket(),
    ALLOWED_ORIGINS: 'https://food.example.test',
    REVIEWER_TOKENS: 'worker-token',
  };
  const form = new FormData();
  form.set('metadata', JSON.stringify(metadata));
  form.set('image', new Blob([jpeg], { type: 'image/jpeg' }), 'ignored.png');
  const submitted = await worker.fetch(new Request('http://worker.local/v1/submissions', { method: 'POST', body: form, headers: { Origin: 'https://food.example.test' } }), env);
  assert.equal(submitted.status, 202);
  const { id } = await submitted.json();

  const list = await worker.fetch(new Request('http://worker.local/v1/admin/submissions?status=pending', { headers: { Authorization: 'Bearer worker-token' } }), env);
  assert.equal(list.status, 200);
  assert.equal((await list.json()).submissions.length, 1);

  const image = await worker.fetch(new Request(`http://worker.local/v1/admin/submissions/${id}/image`, { headers: { Authorization: 'Bearer worker-token' } }), env);
  assert.equal(image.status, 200);
  assert.equal(Buffer.from(await image.arrayBuffer()).toString('hex'), jpeg.toString('hex'));

  const reviewed = await worker.fetch(new Request(`http://worker.local/v1/admin/submissions/${id}/review`, {
    method: 'POST',
    headers: { Authorization: 'Bearer worker-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reject', reason: '图片无法辨识。' }),
  }), env);
  assert.equal(reviewed.status, 200);
  assert.equal((await reviewed.json()).submission.status, 'rejected');
});
