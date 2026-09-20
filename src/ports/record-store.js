/**
 * RecordStore 端口：投稿记录的持久化契约。
 *
 * 服务核心只依赖这个端口；具体实现（本地目录、Postgres、对象存储等）
 * 由外部仓库提供，并在组合根注入。
 *
 * 记录形状：
 *   {
 *     id: string            // 服务端生成的稳定 ID
 *     metadata: object      // 投稿元数据（schemaVersion 1）
 *     imageKey: string|null // 私有原图在 ImageStore 里的键
 *     status: 'pending' | 'approved' | 'rejected'
 *     publicFields: object|null // 批准时写入的公开字段，拒绝时可为 null
 *     createdAt: string     // ISO 8601
 *     updatedAt: string     // ISO 8601
 *   }
 *
 * 审计由独立的 AuditLog 端口负责，不在 RecordStore 内。
 *
 * 实现必须是对象，方法全部返回 Promise；不存在、越界、状态冲突等情况
 * 抛出带 `status`、`code`、`message` 的错误（服务核心用 HttpError 约定）。
 * listRecords(status?) 仅导出模式要求（requireExport），HTTP 服务不需要。
 */
export function assertRecordStore(candidate, { requireExport = false } = {}) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('注入的 RecordStore 必须是对象。');
  }
  const methods = ['create', 'get', 'list', 'review'];
  if (requireExport) methods.push('listRecords');
  for (const method of methods) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`注入的 RecordStore 缺少方法 ${method}()。`);
    }
  }
  return candidate;
}
