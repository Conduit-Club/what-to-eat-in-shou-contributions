import { HttpError } from '../../errors.js';

/**
 * RateLimiter 端口的 Cloudflare D1 实现：每次请求插入一条计数记录，
 * 统计窗口内已有条数，超限抛 429。多 isolate 共享同一个 D1，适合 Workers。
 */
export class D1RateLimiter {
  constructor({ db, windowMs = 60_000, max = 10, now = Date.now }) {
    this.db = db;
    this.windowMs = windowMs;
    this.max = max;
    this.now = now;
  }

  async enforce(key) {
    const now = this.now();
    const threshold = now - this.windowMs;
    await this.db.prepare('DELETE FROM rate_limits WHERE created_at <= ?1').bind(threshold).run();
    await this.db.prepare('INSERT INTO rate_limits (key, created_at) VALUES (?1, ?2)').bind(key, now).run();
    const row = await this.db.prepare(
      'SELECT COUNT(*) AS count FROM rate_limits WHERE key = ?1 AND created_at > ?2',
    ).bind(key, threshold).first();
    if ((row?.count ?? 0) > this.max) throw new HttpError(429, 'rate_limited', '请求过于频繁，请稍后再试。');
  }
}
