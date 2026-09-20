/**
 * AuditLog 端口：审核审计的只追加日志契约。
 *
 * append(entry) -> audit
 *   entry：{ submissionId, action, reviewer, reason, createdAt }
 *   返回的 audit 包含实现生成的 id。
 *
 * list() -> audit[]，按 createdAt 升序。
 *
 * 实现必须是对象，方法返回 Promise；审计只追加，不修改也不删除。
 */
export function assertAuditLog(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('注入的 AuditLog 必须是对象。');
  }
  for (const method of ['append', 'list']) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`注入的 AuditLog 缺少方法 ${method}()。`);
    }
  }
  return candidate;
}
