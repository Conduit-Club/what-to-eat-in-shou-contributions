import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from '../errors.js';
import { validateMetadata } from '../domain/metadata.js';
import { validateAndSanitizeImage } from '../domain/image.js';
import { validatePublication } from '../domain/publication.js';
import { reviewSubmission } from '../domain/review.js';
import { parseSubmissionMultipart } from './multipart.js';
import { adminUiHtml } from './admin-ui.js';
import { publicRecord } from '../domain/record.js';
import { assertRecordStore } from '../ports/record-store.js';
import { assertImageStore } from '../ports/image-store.js';
import { assertAuditLog } from '../ports/audit-log.js';
import { assertRateLimiter } from '../ports/rate-limiter.js';
import { assertClock } from '../ports/clock.js';

export function createApp({ repository, storage, auditLog, clock, rateLimiter, allowedOrigins = [], reviewerTokens = [] } = {}) {
  assertRecordStore(repository);
  assertImageStore(storage);
  assertAuditLog(auditLog);
  assertClock(clock);
  assertRateLimiter(rateLimiter);
  return createServer(async (request, response) => {
    try {
      const origin = request.headers.origin; if (origin && !allowedOrigins.includes(origin) && !isSameOrigin(origin, request.headers.host)) throw new HttpError(403, 'origin_not_allowed', 'Origin 不被允许。');
      if (origin) response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin');
      if (request.method === 'OPTIONS') { response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS'); response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); response.writeHead(204).end(); return; }
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && (url.pathname === '/admin/' || url.pathname === '/admin')) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(adminUiHtml); return; }
      if (request.method === 'POST' && url.pathname === '/v1/submissions') {
        rateLimiter.enforce(request.socket.remoteAddress || 'unknown'); const form = await parseSubmissionMultipart(request); const metadata = validateMetadata(form.metadata); const image = validateAndSanitizeImage(form.image); const imageKey = await storage.put(image); const record = await repository.create(metadata, imageKey); return send(response, 202, { id: record.id, status: 'pending' });
      }
      if (url.pathname.startsWith('/v1/admin/')) {
        const reviewer = authenticate(request, reviewerTokens); const route = /^\/v1\/admin\/submissions\/([^/]+)(?:\/review)?$/.exec(url.pathname);
        const imageRoute = /^\/v1\/admin\/submissions\/([^/]+)\/image$/.exec(url.pathname);
        if (request.method === 'GET' && url.pathname === '/v1/admin/submissions') return send(response, 200, { submissions: await repository.list(url.searchParams.get('status')) });
        if (request.method === 'GET' && imageRoute) { const record = await repository.get(imageRoute[1]); if (!record.imageKey) throw new HttpError(404, 'not_found', '待审图片不存在。'); const image = await storage.read(record.imageKey); response.writeHead(200, { 'Content-Type': image.contentType, 'Cache-Control': 'no-store', 'Content-Length': image.buffer.length }); response.end(image.buffer); return; }
        if (request.method === 'GET' && route && !url.pathname.endsWith('/review')) return send(response, 200, { submission: publicRecord(await repository.get(route[1])) });
        if (request.method === 'POST' && route && url.pathname.endsWith('/review')) { const body = await jsonBody(request); const submission = await repository.get(route[1]); const publicFields = body.action === 'approve' ? validatePublication(body.publicFields, submission.metadata) : body.publicFields; const record = await reviewSubmission({ repository, auditLog, clock, id: route[1], action: body.action, reviewer, reason: body.reason, publicFields }); return send(response, 200, { submission: publicRecord(record) }); }
      }
      throw new HttpError(404, 'not_found', '路由不存在。');
    } catch (error) { send(response, error instanceof HttpError ? error.status : 500, { error: { code: error.code || 'internal_error', message: error instanceof HttpError ? error.message : '服务暂时不可用。' } }); }
  });
}

function send(response, status, data) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(data)); }
function isSameOrigin(origin, host) { if (!host) return false; try { return new URL(origin).host === host; } catch { return false; } }
function authenticate(request, tokens) { const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, ''); const valid = tokens.some((token) => supplied && token.length === supplied.length && timingSafeEqual(Buffer.from(token), Buffer.from(supplied))); if (!valid) throw new HttpError(401, 'unauthorized', '需要审核者认证。'); return `token:${tokens.indexOf(supplied) + 1}`; }
async function jsonBody(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'invalid_json', '请求体必须是 JSON。'); } }
