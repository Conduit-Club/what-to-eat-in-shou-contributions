import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapters } from '../src/composition.js';
import { createApp } from '../src/http/server.js';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const metadata = { schemaVersion: 1, name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '面条口感不错。', openingHours: '待补充', visitedAt: '2026-09-16', imageFilename: 'client-name.png' };

/**
 * 用仓库自带的本地实现包装成一个「外部适配器模块」，走 CONTRIB_ADAPTERS
 * 注入链路跑通投稿、审核、看图与审计。之后换成真正的外部仓库实现时，
 * 本测试的协议与端口契约不变，可以直接作为联调样本。
 */
test('injection path works with built-in adapters wrapped as an external mock module', async () => {
  const root = await mkdtemp(join(tmpdir(), 'injection-smoke-'));
  const dataDir = join(root, 'data');
  const adapterPath = join(root, 'adapter.js');
  await writeFile(adapterPath, adapterModuleSource());

  const adapters = await loadAdapters({ env: { CONTRIB_ADAPTERS: adapterPath }, dataDir });
  const app = createApp({
    repository: adapters.repository,
    storage: adapters.storage,
    auditLog: adapters.auditLog,
    clock: adapters.clock,
    rateLimiter: adapters.rateLimiter,
    allowedOrigins: ['https://food.example.test'],
    reviewerTokens: ['mock-token'],
  });
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.address().port}`;
  try {
    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    form.set('image', new Blob([jpeg], { type: 'image/jpeg' }), 'ignored.png');
    const submitted = await fetch(`${url}/v1/submissions`, { method: 'POST', body: form, headers: { Origin: 'https://food.example.test' } });
    assert.equal(submitted.status, 202);
    const { id } = await submitted.json();

    const list = await fetch(`${url}/v1/admin/submissions?status=pending`, { headers: { Authorization: 'Bearer mock-token' } });
    assert.equal(list.status, 200);
    const payload = await list.json();
    assert.equal(payload.submissions.length, 1);
    assert.equal('imageKey' in payload.submissions[0], false, '审核列表不能带私有图片键');

    const image = await fetch(`${url}/v1/admin/submissions/${id}/image`, { headers: { Authorization: 'Bearer mock-token' } });
    assert.equal(image.status, 200);
    assert.equal(Buffer.from(await image.arrayBuffer()).toString('hex'), jpeg.toString('hex'));

    const reviewed = await fetch(`${url}/v1/admin/submissions/${id}/review`, {
      method: 'POST',
      headers: { Authorization: 'Bearer mock-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', reason: '注入链路冒烟测试。' }),
    });
    assert.equal(reviewed.status, 200);
    assert.equal((await reviewed.json()).submission.status, 'rejected');
    assert.equal((await adapters.auditLog.list()).length, 1, '审核必须留下审计');
  } finally {
    await new Promise((resolve) => app.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

function adapterModuleSource() {
  const module = (name) => new URL(`../src/adapters/${name}.js`, import.meta.url).href;
  return `
import { FileRecordStore } from ${JSON.stringify(module('record-store'))};
import { PrivateImageStore } from ${JSON.stringify(module('image-store'))};
import { FileAuditLog } from ${JSON.stringify(module('file-audit-log'))};
import { MemoryRateLimiter } from ${JSON.stringify(module('memory-rate-limiter'))};
import { SystemClock } from ${JSON.stringify(module('system-clock'))};
import { CryptoIdGenerator } from ${JSON.stringify(module('crypto-id-generator'))};

export async function createAdapters({ dataDir }) {
  const clock = new SystemClock();
  const idGenerator = new CryptoIdGenerator();
  return {
    repository: new FileRecordStore({ root: dataDir, clock, idGenerator }),
    storage: new PrivateImageStore({ root: dataDir, idGenerator }),
    auditLog: new FileAuditLog({ root: dataDir, idGenerator }),
    rateLimiter: new MemoryRateLimiter(),
    clock,
    idGenerator,
  };
}
`;
}
