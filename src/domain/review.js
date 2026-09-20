import { HttpError } from '../errors.js';

/**
 * 审核用例：先校验，再写审计，最后落记录。
 * 顺序刻意保持「先审计后记录」：宁可留下一条对应不上状态的审计，
 * 也不能出现改了记录却没有审计凭据的情况。
 */
export async function reviewSubmission({ repository, auditLog, clock, id, action, reviewer, reason, publicFields }) {
  const record = await repository.get(id);
  if (record.status !== 'pending') throw new HttpError(409, 'invalid_state', '该投稿已审核。');
  if (!['approve', 'reject'].includes(action)) throw new HttpError(422, 'invalid_action', 'action 必须为 approve 或 reject。');
  if (action === 'reject' && !reason?.trim()) throw new HttpError(422, 'missing_rejection_reason', '拒绝投稿时必须填写原因。');

  const reviewedAt = clock.now();
  await auditLog.append({ submissionId: id, action, reviewer, reason: reason?.trim() || null, createdAt: reviewedAt });
  return repository.review(id, action, reviewer, reason?.trim() || null, publicFields ?? null, reviewedAt);
}
