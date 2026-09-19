import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './http/server.js';
import { FileRecordStore } from './adapters/record-store.js';
import { PrivateImageStore } from './adapters/image-store.js';

// 一个进程，一个数据目录：没有数据库、没有对象存储、没有第二个运行时。
const list = (value) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);
const port = Number(process.env.PORT || 3001);
const dataDir = resolve(process.env.DATA_DIR || '.data');
await mkdir(dataDir, { recursive: true, mode: 0o700 });

const app = createApp({
  repository: new FileRecordStore({ root: dataDir }),
  storage: new PrivateImageStore({ root: dataDir }),
  allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  reviewerTokens: list(process.env.REVIEWER_TOKENS),
});
app.listen(port, () => console.log(`Contribution service listening on ${port}，数据目录 ${dataDir}`));
