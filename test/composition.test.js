import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAdapters } from '../src/composition.js';

test('loads built-in file adapters when no module is configured', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'adapters-default-'));
  try {
    const adapters = await loadAdapters({ env: {}, dataDir });
    assert.equal(typeof adapters.repository.create, 'function');
    assert.equal(typeof adapters.repository.listRecords, 'function');
    assert.equal(typeof adapters.storage.put, 'function');
    assert.equal(typeof adapters.auditLog.append, 'function');
    assert.equal(typeof adapters.rateLimiter.enforce, 'function');
    assert.equal(typeof adapters.clock.now, 'function');
    assert.equal(typeof adapters.idGenerator.randomId, 'function');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('loads adapters injected from an external module factory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'adapters-external-'));
  try {
    const modulePath = join(dir, 'adapter.js');
    await writeFile(modulePath, `
      export async function createAdapters({ env }) {
        return {
          recordStore: { create() {}, get() {}, list() {}, listRecords() {}, review() {} },
          imageStore: { put() {}, read() {} },
          auditLog: { append() {}, list() {} },
          rateLimiter: { enforce() {} },
          clock: { now() { return new Date().toISOString(); } },
          idGenerator: { randomId() { return 'x'; } },
        };
      }
    `);
    const adapters = await loadAdapters({ env: { CONTRIB_ADAPTERS: modulePath }, dataDir: join(dir, 'data') });
    assert.equal(typeof adapters.repository.listRecords, 'function');
    assert.equal(typeof adapters.storage.read, 'function');
    assert.equal(typeof adapters.auditLog.list, 'function');
    assert.equal(typeof adapters.rateLimiter.enforce, 'function');
    assert.equal(typeof adapters.clock.now, 'function');
    assert.equal(typeof adapters.idGenerator.randomId, 'function');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loads adapters from a module that exports the object directly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'adapters-object-'));
  try {
    const modulePath = join(dir, 'adapter.js');
    await writeFile(modulePath, `
      export const repository = { create() {}, get() {}, list() {}, listRecords() {}, review() {} };
      export const storage = { put() {}, read() {} };
      export const auditLog = { append() {}, list() {} };
      export const rateLimiter = { enforce() {} };
      export const clock = { now() { return new Date().toISOString(); } };
      export const idGenerator = { randomId() { return 'x'; } };
    `);
    const adapters = await loadAdapters({ env: { CONTRIB_ADAPTERS: modulePath }, dataDir: join(dir, 'data') });
    assert.equal(typeof adapters.repository.listRecords, 'function');
    assert.equal(typeof adapters.storage.put, 'function');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects injected adapters that miss port methods', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'adapters-bad-'));
  try {
    const modulePath = join(dir, 'adapter.js');
    await writeFile(modulePath, `
      export const repository = { create() {} };
      export const storage = { put() {} };
    `);
    await assert.rejects(
      () => loadAdapters({ env: { CONTRIB_ADAPTERS: modulePath }, dataDir: join(dir, 'data') }),
      /缺少方法/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('export mode requires listRecords from the injected record store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'adapters-no-export-'));
  try {
    const modulePath = join(dir, 'adapter.js');
    await writeFile(modulePath, `
      export const repository = { create() {}, get() {}, list() {}, review() {} };
      export const storage = { put() {}, read() {} };
      export const auditLog = { append() {}, list() {} };
    `);
    await assert.rejects(
      () => loadAdapters({ env: { CONTRIB_ADAPTERS: modulePath }, dataDir: join(dir, 'data'), requireExport: true }),
      /缺少方法 listRecords/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
