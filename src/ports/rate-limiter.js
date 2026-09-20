/**
 * RateLimiter 端口：投稿接口的匿名限流契约。
 *
 * 服务核心只依赖这个端口；进程内内存实现只适用于单实例，多实例或
 * 无状态平台应注入 Redis/边缘等实现。
 *
 * enforce(key)
 *   key 通常来自请求来源地址。允许请求时什么都不返回；
 *   超限时抛出 `status = 429`、`code = 'rate_limited'` 的错误。
 *
 * 实现必须是对象；enforce 可以是同步或异步函数。
 */
export function assertRateLimiter(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('注入的 RateLimiter 必须是对象。');
  }
  if (typeof candidate.enforce !== 'function') {
    throw new TypeError('注入的 RateLimiter 缺少方法 enforce(key)。');
  }
  return candidate;
}
