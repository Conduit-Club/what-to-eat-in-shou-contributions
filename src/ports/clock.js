/**
 * Clock 端口：时间来源契约。
 *
 * 服务核心不直接调用 Date；需要时间戳时通过该端口取得。
 * now() 返回 ISO 8601 字符串，例如 2026-09-20T12:00:00.000Z。
 */
export function assertClock(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('注入的 Clock 必须是对象。');
  }
  if (typeof candidate.now !== 'function') {
    throw new TypeError('注入的 Clock 缺少方法 now()。');
  }
  return candidate;
}
