import { HttpError } from './errors.js';
import { validateMetadata } from './domain/metadata.js';
import { validateAndSanitizeImage } from './domain/image.js';
import { validatePublication } from './domain/publication.js';
import { reviewSubmission } from './domain/review.js';
import { publicRecord } from './domain/record.js';
import { adminUiHtml } from './http/admin-ui.js';
import { createCloudflareAdapters } from './cloudflare-composition.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const list = (value) => (value || '').split(',').map((item) => item.trim()).filter(Boolean);

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env, createCloudflareAdapters(env));
    } catch (error) {
      return json(error instanceof HttpError ? error.status : 500, {
        error: { code: error.code || 'internal_error', message: error instanceof HttpError ? error.message : '服务暂时不可用。' },
      });
    }
  },
};

async function handleRequest(request, env, adapters) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = list(env.ALLOWED_ORIGINS);
  if (origin && !allowedOrigins.includes(origin) && !isSameOrigin(origin, request.url)) throw new HttpError(403, 'origin_not_allowed', 'Origin 不被允许。');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...corsHeaders(origin), 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });

  const url = new URL(request.url);
  const headers = corsHeaders(origin);

  if (request.method === 'GET' && (url.pathname === '/admin/' || url.pathname === '/admin')) {
    return new Response(adminUiHtml, { status: 200, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  if (request.method === 'POST' && url.pathname === '/v1/submissions') {
    adapters.rateLimiter.enforce(request.headers.get('CF-Connecting-IP') || 'unknown');
    const form = await parseForm(request);
    const metadata = validateMetadata(form.metadata);
    const image = validateAndSanitizeImage(form.image);
    const imageKey = await adapters.storage.put(image);
    const record = await adapters.repository.create(metadata, imageKey);
    return json(202, { id: record.id, status: 'pending' }, headers);
  }

  if (url.pathname.startsWith('/v1/admin/')) {
    const reviewer = authenticate(request, list(env.REVIEWER_TOKENS));
    const route = /^\/v1\/admin\/submissions\/([^/]+)(?:\/review)?$/.exec(url.pathname);
    const imageRoute = /^\/v1\/admin\/submissions\/([^/]+)\/image$/.exec(url.pathname);
    if (request.method === 'GET' && url.pathname === '/v1/admin/submissions') {
      return json(200, { submissions: await adapters.repository.list(url.searchParams.get('status')) }, headers);
    }
    if (request.method === 'GET' && imageRoute) {
      const record = await adapters.repository.get(imageRoute[1]);
      if (!record.imageKey) throw new HttpError(404, 'not_found', '待审图片不存在。');
      const image = await adapters.storage.read(record.imageKey);
      return new Response(image.buffer, { status: 200, headers: { ...headers, 'Content-Type': image.contentType, 'Cache-Control': 'no-store', 'Content-Length': String(image.buffer.length) } });
    }
    if (request.method === 'GET' && route && !url.pathname.endsWith('/review')) {
      return json(200, { submission: publicRecord(await adapters.repository.get(route[1])) }, headers);
    }
    if (request.method === 'POST' && route && url.pathname.endsWith('/review')) {
      const body = await parseJson(request);
      const submission = await adapters.repository.get(route[1]);
      const publicFields = body.action === 'approve' ? validatePublication(body.publicFields, submission.metadata) : body.publicFields;
      const record = await reviewSubmission({ repository: adapters.repository, auditLog: adapters.auditLog, clock: adapters.clock, id: route[1], action: body.action, reviewer, reason: body.reason, publicFields });
      return json(200, { submission: publicRecord(record) }, headers);
    }
  }

  throw new HttpError(404, 'not_found', '路由不存在。');
}

async function parseForm(request) {
  let form;
  try { form = await request.formData(); } catch { throw new HttpError(400, 'invalid_multipart', '请求体必须是 multipart/form-data。'); }
  const metadata = form.get('metadata');
  const image = form.get('image');
  if (typeof metadata !== 'string' || !image || typeof image === 'string') throw new HttpError(400, 'invalid_multipart', '必须且只能提供 metadata 和 image。');
  const buffer = Buffer.from(await image.arrayBuffer());
  return { metadata, image: buffer };
}

async function parseJson(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'invalid_json', '请求体必须是 JSON。'); }
}

function authenticate(request, tokens) {
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const valid = tokens.some((token) => supplied && safeEqual(token, supplied));
  if (!valid) throw new HttpError(401, 'unauthorized', '需要审核者认证。');
  return `token:${tokens.indexOf(supplied) + 1}`;
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a[index] ^ b[index];
  return result === 0;
}

function corsHeaders(origin) {
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
}

function isSameOrigin(origin, requestUrl) {
  try { return new URL(origin).host === new URL(requestUrl).host; } catch { return false; }
}

function json(status, data, headers = JSON_HEADERS) {
  return new Response(JSON.stringify(data), { status, headers });
}
