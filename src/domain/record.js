/**
 * 投稿记录的公开投影：删掉私有图片键，其余字段原样返回。
 * HTTP 层与仓储实现共用这一个函数，避免适配器细节泄漏进协议层。
 */
export function publicRecord(record) {
  const { imageKey, ...safe } = record;
  return safe;
}
