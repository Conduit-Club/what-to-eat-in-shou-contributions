import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';

const exec = promisify(execFile);

/**
 * Apply an already validated site plan in an isolated git worktree.
 * The caller owns pushing the branch and opening the provider PR.
 */
export async function publishPlanInWorktree({ repository, baseBranch = 'dev', branch, plan, worktreeRoot, commitMessage, check = [] }) {
  if (!repository || !branch || !plan?.changes?.length) throw new Error('repository, branch and plan changes are required');
  const worktree = `${worktreeRoot || '/tmp'}/shou-publish-${randomUUID()}`;
  await mkdir(worktreeRoot || '/tmp', { recursive: true });
  try {
    await git(repository, ['fetch', 'origin', baseBranch]);
    await git(repository, ['worktree', 'add', '--detach', worktree, `origin/${baseBranch}`]);
    for (const change of plan.changes) {
      const target = `${worktree}/${change.path}`;
      await mkdir(target.slice(0, target.lastIndexOf('/')), { recursive: true });
      const content = change.encoding === 'base64' ? Buffer.from(change.content, 'base64') : change.content;
      await writeFile(target, content);
    }
    for (const command of check) await exec(command[0], command.slice(1), { cwd: worktree });
    await git(repository, ['-C', worktree, 'checkout', '-b', branch]);
    await git(repository, ['-C', worktree, 'add', '--', ...plan.changes.map((change) => change.path)]);
    await git(repository, ['-C', worktree, '-c', 'user.name=SHOU contribution bot', '-c', 'user.email=contributions@shou.invalid', 'commit', '-m', commitMessage || `Publish ${plan.restaurantId}`]);
    const { stdout } = await git(repository, ['-C', worktree, 'rev-parse', 'HEAD']);
    return { worktree, commitSha: stdout.trim(), branch };
  } finally {
    await git(repository, ['worktree', 'remove', '--force', worktree], { allowFailure: true });
    await rm(worktree, { recursive: true, force: true });
  }
}

async function git(repository, args, { allowFailure = false } = {}) {
  try { return await exec('git', ['-C', repository, ...args]); }
  catch (error) { if (allowFailure) return { stdout: '', stderr: error.stderr || '' }; throw error; }
}
