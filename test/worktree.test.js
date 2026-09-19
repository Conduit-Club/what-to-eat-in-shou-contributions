import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { publishPlanInWorktree } from '../src/export/worktree.js';

const exec = promisify(execFile);

test('publishes a plan in an isolated worktree and cleans it up', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shou-site-'));
  await exec('git', ['init', '--bare', join(root, 'remote.git')]);
  const source = join(root, 'source');
  await exec('git', ['clone', join(root, 'remote.git'), source]);
  await exec('git', ['-C', source, 'checkout', '-b', 'dev']);
  await writeFile(join(source, 'README.md'), 'base\n');
  await exec('git', ['-C', source, 'add', '.']);
  await exec('git', ['-C', source, '-c', 'user.name=test', '-c', 'user.email=test@example.test', 'commit', '-m', 'base']);
  await exec('git', ['-C', source, 'push', '-u', 'origin', 'dev']);
  const result = await publishPlanInWorktree({ repository: source, branch: 'contrib/test', plan: { restaurantId: 'test', changes: [{ path: 'README.md', encoding: 'utf8', content: 'published\n' }] } });
  assert.match(result.commitSha, /^[0-9a-f]{40}$/);
  assert.equal((await exec('git', ['-C', source, 'status', '--porcelain'])).stdout, '');
  assert.equal((await exec('git', ['-C', source, 'worktree', 'list'])).stdout.split('\n').length, 2);
  assert.equal((await readFile(join(source, 'README.md'), 'utf8')), 'base\n');
});
