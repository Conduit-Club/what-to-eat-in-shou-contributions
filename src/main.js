import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './http/server.js';
import { MemoryRepository } from './adapters/repository.js';
import { LocalPrivateStorage } from './adapters/storage.js';
import { PostgresRepository } from './adapters/postgres.js';
import { S3PrivateStorage } from './adapters/s3.js';

const port = Number(process.env.PORT || 3001); const privateDir = resolve(process.env.PRIVATE_STORAGE_DIR || '.data/private');
await mkdir(privateDir, { recursive: true, mode: 0o700 });
const production = Boolean(process.env.DATABASE_URL || process.env.S3_BUCKET);
if (production && (!process.env.DATABASE_URL || !process.env.S3_BUCKET || !process.env.S3_REGION || !process.env.S3_ACCESS_KEY_ID || !process.env.S3_SECRET_ACCESS_KEY)) throw new Error('Production storage requires DATABASE_URL and complete S3 configuration.');
const repository = production ? new PostgresRepository(process.env.DATABASE_URL) : new MemoryRepository();
const storage = production ? new S3PrivateStorage({ bucket: process.env.S3_BUCKET, endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }) : new LocalPrivateStorage(privateDir);
if (production) await repository.migrate();
const app = createApp({ repository, storage, allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean), reviewerTokens: (process.env.REVIEWER_TOKENS || '').split(',').filter(Boolean) });
app.listen(port, () => console.log(`Contribution service listening on ${port}`));
