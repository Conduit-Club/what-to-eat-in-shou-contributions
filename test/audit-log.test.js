import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileAuditLog } from '../src/adapters/file-audit-log.js';

test('appends audit entries and lists them in time order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'audits-'));
  try {
    const idGenerator = { randomId: (() => { let counter = 0; return () => `audit-${counter += 1}`; })() };
    const auditLog = new FileAuditLog({ root, idGenerator });
    await auditLog.append({ submissionId: 's1', action: 'approve', reviewer: 'token:1', reason: null, createdAt: '2026-09-19T13:50:21.854Z' });
    await auditLog.append({ submissionId: 's2', action: 'reject', reviewer: 'token:2', reason: '重复投稿。', createdAt: '2026-09-19T13:51:21.854Z' });

    const audits = await auditLog.list();
    assert.deepEqual(audits.map((audit) => ({ action: audit.action, reviewer: audit.reviewer })), [
      { action: 'approve', reviewer: 'token:1' },
      { action: 'reject', reviewer: 'token:2' },
    ]);
    assert.match(audits[0].id, /^audit-\d+$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('returns an empty list when no audit has been written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'audits-empty-'));
  try {
    const auditLog = new FileAuditLog({ root, idGenerator: { randomId: () => 'x' } });
    assert.deepEqual(await auditLog.list(), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
