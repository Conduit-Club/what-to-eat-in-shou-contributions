import { D1RecordStore } from './adapters/cloudflare/d1-record-store.js';
import { D1AuditLog } from './adapters/cloudflare/d1-audit-log.js';
import { D1RateLimiter } from './adapters/cloudflare/d1-rate-limiter.js';
import { R2ImageStore } from './adapters/cloudflare/r2-image-store.js';
import { SystemClock } from './adapters/system-clock.js';
import { CryptoIdGenerator } from './adapters/crypto-id-generator.js';

/**
 * Cloudflare Workers 的组合根：把 Wrangler 注入的 D1 与 R2 绑定接到端口上。
 * 不 import Node 专属模块，worker 入口只依赖这里。
 */
export function createCloudflareAdapters(env) {
  const clock = new SystemClock();
  const idGenerator = new CryptoIdGenerator();
  return {
    repository: new D1RecordStore({ db: env.DB, clock, idGenerator }),
    storage: new R2ImageStore({ bucket: env.IMAGES, idGenerator }),
    auditLog: new D1AuditLog({ db: env.DB, idGenerator }),
    rateLimiter: new D1RateLimiter({ db: env.DB }),
    clock,
    idGenerator,
    github: null,
  };
}
