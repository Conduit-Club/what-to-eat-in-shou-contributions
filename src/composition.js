import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FileRecordStore } from './adapters/record-store.js';
import { PrivateImageStore } from './adapters/image-store.js';
import { FileAuditLog } from './adapters/file-audit-log.js';
import { MemoryRateLimiter } from './adapters/memory-rate-limiter.js';
import { SystemClock } from './adapters/system-clock.js';
import { CryptoIdGenerator } from './adapters/crypto-id-generator.js';
import { GitHubClient } from './export/github.js';
import { assertRecordStore } from './ports/record-store.js';
import { assertImageStore } from './ports/image-store.js';
import { assertAuditLog } from './ports/audit-log.js';
import { assertRateLimiter } from './ports/rate-limiter.js';
import { assertClock } from './ports/clock.js';
import { assertIdGenerator } from './ports/id-generator.js';
import { assertGitHubClient } from './ports/github-client.js';

/**
 * 组合根：把「端口」接到「具体实现」上的唯一地方。
 *
 * 服务核心不 import 任何具体存储实现；这里根据环境变量选择实现：
 * - 默认：仓库自带的本地文件适配器（开发与单机部署用）。
 * - 注入：`CONTRIB_ADAPTERS` 指向外部仓库的适配器模块，模块可以是
 *   ESM 文件路径、file:// URL，或已安装的包名。
 *
 * 外部模块可导出：
 *   createAdapters({ env, dataDir }) => {
 *     repository, storage, auditLog, rateLimiter?,
 *     clock?, idGenerator?, github?,
 *   }
 * 或直接导出同样的对象。字段别名：repository|recordStore、
 * storage|imageStore、idGenerator|idGen 均可。
 */
export async function loadAdapters({ env = process.env, dataDir = resolve(env.DATA_DIR || '.data'), requireExport = false } = {}) {
  const injected = env.CONTRIB_ADAPTERS ? await loadExternalAdapters(env.CONTRIB_ADAPTERS, { env, dataDir }) : {};
  const defaults = env.CONTRIB_ADAPTERS ? {} : await createFileAdapters(dataDir);
  const adapters = { ...defaults, ...injected };

  const repository = adapters.repository ?? adapters.recordStore;
  const storage = adapters.storage ?? adapters.imageStore;
  const auditLog = adapters.auditLog ?? adapters.audit;
  const rateLimiter = adapters.rateLimiter ?? createDefaultRateLimiter(env);
  const clock = adapters.clock ?? new SystemClock();
  const idGenerator = adapters.idGenerator ?? adapters.idGen ?? new CryptoIdGenerator();
  const github = adapters.github ?? createDefaultGitHubClient(env);

  assertRecordStore(repository, { requireExport });
  assertImageStore(storage);
  assertAuditLog(auditLog);
  assertRateLimiter(rateLimiter);
  assertClock(clock);
  assertIdGenerator(idGenerator);
  if (github) assertGitHubClient(github);

  return { repository, storage, auditLog, rateLimiter, clock, idGenerator, github };
}

async function createFileAdapters(dataDir) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const clock = new SystemClock();
  const idGenerator = new CryptoIdGenerator();
  return {
    repository: new FileRecordStore({ root: dataDir, clock, idGenerator }),
    storage: new PrivateImageStore({ root: dataDir, idGenerator }),
    auditLog: new FileAuditLog({ root: dataDir, idGenerator }),
    clock,
    idGenerator,
  };
}

function createDefaultRateLimiter(env) {
  const windowMs = Number(env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(env.RATE_LIMIT_MAX || 10);
  return new MemoryRateLimiter({ windowMs, max });
}

function createDefaultGitHubClient(env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) return null;
  const [owner, repository] = String(env.GITHUB_REPOSITORY).split('/');
  if (!owner || !repository) return null;
  return new GitHubClient({ owner, repository, token: env.GITHUB_TOKEN });
}

async function loadExternalAdapters(specifier, { env, dataDir }) {
  const module = await importAdapterModule(specifier);
  const factory = module.createAdapters ?? module.default;
  const produced = typeof factory === 'function' ? await factory({ env, dataDir }) : module;
  return produced?.adapters && typeof produced.adapters === 'object' ? produced.adapters : produced;
}

async function importAdapterModule(specifier) {
  try {
    return await import(specifier);
  } catch (error) {
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
      return import(pathToFileURL(resolve(specifier)).href);
    }
    throw new Error(`无法加载适配器模块 ${specifier}：${error.message}`);
  }
}
