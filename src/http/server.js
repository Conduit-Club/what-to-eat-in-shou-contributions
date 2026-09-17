import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from '../errors.js';
import { validateMetadata } from '../domain/metadata.js';
import { validateAndSanitizeImage } from '../domain/image.js';
import { validatePublication } from '../domain/publication.js';
import { parseSubmissionMultipart } from './multipart.js';
import { publicRecord } from '../adapters/repository.js';

export function createApp({ repository, storage, allowedOrigins = [], reviewerTokens = [], rateLimit = { windowMs: 60_000, max: 10 } }) {
  const attempts = new Map();
  return createServer(async (request, response) => {
    try {
      const origin = request.headers.origin; if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, 'origin_not_allowed', 'Origin 不被允许。');
      if (origin) response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
      if (request.method === 'OPTIONS') { response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); response.writeHead(204).end(); return; }
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'POST' && url.pathname === '/v1/submissions') {
        enforceRateLimit(request, attempts, rateLimit); const form = await parseSubmissionMultipart(request); const metadata = validateMetadata(form.metadata); const image = validateAndSanitizeImage(form.image); const imageKey = await storage.putPending(image); const record = await repository.create(metadata, imageKey); return send(response, 202, { id: record.id, status: 'pending' });
      }
      if (url.pathname.startsWith('/v1/admin/')) {
        const reviewer = authenticate(request, reviewerTokens); const route = /^\/v1\/admin\/submissions\/([^/]+)(?:\/review)?$/.exec(url.pathname);
        if (request.method === 'GET' && url.pathname === '/v1/admin/submissions') return send(response, 200, { submissions: await repository.list(url.searchParams.get('status')) });
        if (request.method === 'GET' && route && !url.pathname.endsWith('/review')) return send(response, 200, { submission: publicRecord(await repository.get(route[1])) });
        if (request.method === 'POST' && route && url.pathname.endsWith('/review')) { const body = await jsonBody(request); const submission = await repository.get(route[1]); const publicFields = body.action === 'approve' ? validatePublication(body.publicFields, submission.metadata) : body.publicFields; const record = await repository.review(route[1], body.action, reviewer, body.reason, publicFields); return send(response, 200, { submission: publicRecord(record) }); }
      }
      throw new HttpError(404, 'not_found', '路由不存在。');
    } catch (error) { send(response, error instanceof HttpError ? error.status : 500, { error: { code: error.code || 'internal_error', message: error instanceof HttpError ? error.message : '服务暂时不可用。' } }); }
  });
}

function send(response, status, data) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); }
function enforceRateLimit(request, attempts, { windowMs, max }) { const now = Date.now(); const key = request.socket.remoteAddress || 'unknown'; const recent = (attempts.get(key) || []).filter((time) => now - time < windowMs); if (recent.length >= max) throw new HttpError(429, 'rate_limited', '请求过于频繁，请稍后再试。'); recent.push(now); attempts.set(key, recent); }
function authenticate(request, tokens) { const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, ''); const valid = tokens.some((token) => supplied && token.length === supplied.length && timingSafeEqual(Buffer.from(token), Buffer.from(supplied))); if (!valid) throw new HttpError(401, 'unauthorized', '需要审核者认证。'); return `token:${tokens.indexOf(supplied) + 1}`; }
async function jsonBody(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'invalid_json', '请求体必须是 JSON。'); } }
