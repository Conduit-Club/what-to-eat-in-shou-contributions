import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/worker.js';

test('Workers entrypoint accepts a multipart submission with D1 and R2 bindings', async () => {
  const rows = [];
  const db = {
    prepare(sql) {
      return { bind(...values) { return { run: async () => { rows.push({ sql, values }); }, all: async () => ({ results: rows.filter((row) => row.sql.startsWith('INSERT')) }), first: async () => null }; } };
    },
    batch: async () => {},
  };
  let stored;
  const env = { DB: db, PENDING_IMAGES: { put: async (key, value) => { stored = { key, value }; } }, ALLOWED_ORIGINS: 'https://food.example.test', REVIEWER_TOKEN: 'secret' };
  const form = new FormData();
  form.set('metadata', JSON.stringify({ schemaVersion: 1, name: '测试店', category: 'on-campus', location: '一食堂', taste: '好吃', openingHours: '待补充', visitedAt: '2026-09-18', imageFilename: 'a.jpg' }));
  form.set('image', new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'a.jpg');
  const response = await worker.fetch(new Request('https://api.example.test/v1/submissions', { method: 'POST', body: form, headers: { Origin: 'https://food.example.test' } }), env);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).status, 'pending');
  assert.match(stored.key, /^pending\/[0-9a-f-]+\.jpg$/);
  assert.equal(rows.length, 1);
});
