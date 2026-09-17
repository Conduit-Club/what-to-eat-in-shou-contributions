import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from './http/server.js';
import { MemoryRepository } from './adapters/repository.js';
import { LocalPrivateStorage } from './adapters/storage.js';

const port = Number(process.env.PORT || 3001); const privateDir = resolve(process.env.PRIVATE_STORAGE_DIR || '.data/private');
await mkdir(privateDir, { recursive: true, mode: 0o700 });
const app = createApp({ repository: new MemoryRepository(), storage: new LocalPrivateStorage(privateDir), allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean), reviewerTokens: (process.env.REVIEWER_TOKENS || '').split(',').filter(Boolean) });
app.listen(port, () => console.log(`Contribution service listening on ${port}`));
