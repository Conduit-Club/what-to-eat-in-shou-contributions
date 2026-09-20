import { HttpError } from '../errors.js';

/** RateLimiter 端口的默认实现：进程内按 key 计数，仅适用于单实例。 */
export class MemoryRateLimiter {
  constructor({ windowMs = 60_000, max = 10, now = Date.now } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.now = now;
    this.attempts = new Map();
  }

  enforce(key) {
    const now = this.now();
    const recent = (this.attempts.get(key) || []).filter((time) => now - time < this.windowMs);
    if (recent.length >= this.max) throw new HttpError(429, 'rate_limited', '请求过于频繁，请稍后再试。');
    recent.push(now);
    this.attempts.set(key, recent);
  }
}
