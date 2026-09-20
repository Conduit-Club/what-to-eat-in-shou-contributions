import { resolve } from 'node:path';
import { createApp } from './http/server.js';
import { loadAdapters } from './composition.js';

// 服务核心只依赖端口；具体实现由组合根根据 CONTRIB_ADAPTERS 注入。
const list = (value) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);
const port = Number(process.env.PORT || 3001);
const dataDir = resolve(process.env.DATA_DIR || '.data');

const adapters = await loadAdapters({ env: process.env, dataDir });
const app = createApp({
  repository: adapters.repository,
  storage: adapters.storage,
  auditLog: adapters.auditLog,
  clock: adapters.clock,
  rateLimiter: adapters.rateLimiter,
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  reviewerTokens: list(process.env.REVIEWER_TOKENS),
});
const adapterName = process.env.CONTRIB_ADAPTERS || '内置文件适配器';
app.listen(port, () => console.log(`Contribution service listening on ${port}，适配器：${adapterName}，数据目录 ${dataDir}`));
