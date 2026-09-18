import { validateMetadata } from './domain/metadata.js';
import { validateAndSanitizeImage } from './domain/image.js';
import { validatePublication } from './domain/publication.js';
import { HttpError } from './errors.js';

const maxImageBytes = 5 * 1024 * 1024;

/** Cloudflare Workers entrypoint. Bindings: DB (D1), PENDING_IMAGES (R2), REVIEWER_TOKEN (secret). */
export default {
  async fetch(request, env) {
    try {
      const origin = request.headers.get('Origin');
      const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
      if (origin && !allowed.includes(origin)) throw new HttpError(403, 'origin_not_allowed', 'Origin 不被允许。');
      if (request.method === 'OPTIONS') return response(null, 204, corsHeaders(origin));
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname === '/v1/submissions') return await submit(request, env, origin);
      if (url.pathname.startsWith('/v1/admin/')) {
        authenticate(request, env);
        if (request.method === 'GET' && url.pathname === '/v1/admin/submissions') return await list(env, url.searchParams.get('status'), origin);
        if (request.method === 'GET' && url.pathname === '/v1/admin/publications') return await publicationList(env, origin);
        const route = /^\/v1\/admin\/submissions\/([^/]+)\/review$/.exec(url.pathname);
        if (request.method === 'POST' && route) return await review(request, env, route[1], origin);
        const publicationRoute = /^\/v1\/admin\/publications\/([^/]+)\/(retry|revert)$/.exec(url.pathname);
        if (request.method === 'POST' && publicationRoute) return await publicationAction(env, publicationRoute[1], publicationRoute[2], origin);
      }
      throw new HttpError(404, 'not_found', '路由不存在。');
    } catch (error) {
      return response({ error: { code: error.code || 'internal_error', message: error instanceof HttpError ? error.message : '服务暂时不可用。' } }, error instanceof HttpError ? error.status : 500);
    }
  },
};

async function submit(request, env, origin) {
  const form = await request.formData();
  const metadata = validateMetadata(String(form.get('metadata') || ''));
  const file = form.get('image');
  if (!(file instanceof File)) throw new HttpError(422, 'missing_image', 'image 为必填项。');
  if (file.size > maxImageBytes) throw new HttpError(413, 'image_too_large', '图片不能超过 5 MiB。');
  const image = validateAndSanitizeImage(Buffer.from(await file.arrayBuffer()));
  const id = crypto.randomUUID();
  const imageKey = `pending/${id}.${image.extension}`;
  await env.PENDING_IMAGES.put(imageKey, image.buffer, { httpMetadata: { contentType: `image/${image.type}` } });
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO submissions (id, metadata, image_key, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, JSON.stringify(metadata), imageKey, 'pending', now, now).run();
  return response({ id, status: 'pending' }, 202, corsHeaders(origin));
}

async function list(env, status, origin) {
  const query = status ? 'SELECT id, metadata, status, public_fields, created_at, updated_at FROM submissions WHERE status = ? ORDER BY created_at ASC' : 'SELECT id, metadata, status, public_fields, created_at, updated_at FROM submissions ORDER BY created_at ASC';
  const result = status ? await env.DB.prepare(query).bind(status).all() : await env.DB.prepare(query).all();
  return response({ submissions: result.results.map(row) }, 200, corsHeaders(origin));
}

async function review(request, env, id, origin) {
  const body = await request.json();
  const existing = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?').bind(id).first();
  if (!existing) throw new HttpError(404, 'not_found', '投稿不存在。');
  if (existing.status !== 'pending') throw new HttpError(409, 'invalid_state', '该投稿已审核。');
  const metadata = JSON.parse(existing.metadata);
  const publicFields = body.action === 'approve' ? validatePublication(body.publicFields, metadata) : null;
  if (body.action === 'reject' && !body.reason?.trim()) throw new HttpError(422, 'missing_rejection_reason', '拒绝投稿时必须填写原因。');
  if (!['approve', 'reject'].includes(body.action)) throw new HttpError(422, 'invalid_action', 'action 必须为 approve 或 reject。');
  const status = body.action === 'approve' ? 'approved' : 'rejected';
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare('UPDATE submissions SET status = ?, public_fields = ?, updated_at = ? WHERE id = ?').bind(status, publicFields ? JSON.stringify(publicFields) : null, now, id),
    env.DB.prepare('INSERT INTO moderation_audits (id, submission_id, action, reviewer, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, body.action, 'worker-reviewer', body.reason?.trim() || null, now),
  ];
  if (body.action === 'approve') statements.push(env.DB.prepare('INSERT OR IGNORE INTO publication_jobs (id, submission_id, operation, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, 'publish', 'queued', now, now));
  await env.DB.batch(statements);
  return response({ submission: { ...row(existing), status, publicFields }, publication: body.action === 'approve' ? { status: 'queued' } : null }, 200, corsHeaders(origin));
}

async function publicationList(env, origin) {
  const result = await env.DB.prepare('SELECT * FROM publication_jobs ORDER BY created_at ASC').all();
  return response({ publications: result.results.map(publicationRow) }, 200, corsHeaders(origin));
}

async function publicationAction(env, id, action, origin) {
  const existing = await env.DB.prepare('SELECT * FROM publication_jobs WHERE id = ?').bind(id).first();
  if (!existing) throw new HttpError(404, 'not_found', '发布任务不存在。');
  const now = new Date().toISOString();
  if (action === 'retry') {
    if (!['failed', 'revert_conflict', 'cancelled'].includes(existing.status)) throw new HttpError(409, 'invalid_state', '当前发布任务不可重试。');
    await env.DB.prepare('UPDATE publication_jobs SET status = ?, error = NULL, updated_at = ? WHERE id = ?').bind('queued', now, id).run();
    return response({ publication: { ...publicationRow(existing), status: 'queued', error: null, updatedAt: now } }, 200, corsHeaders(origin));
  }
  if (existing.operation !== 'publish' || existing.status !== 'merged') throw new HttpError(409, 'invalid_state', '只有已合并的发布任务可以回滚。');
  const revertId = crypto.randomUUID();
  await env.DB.prepare('INSERT OR IGNORE INTO publication_jobs (id, submission_id, operation, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(revertId, existing.submission_id, 'revert', 'queued', now, now).run();
  return response({ publication: { id: revertId, submissionId: existing.submission_id, operation: 'revert', status: 'queued', createdAt: now, updatedAt: now } }, 202, corsHeaders(origin));
}

function authenticate(request, env) {
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!supplied || !env.REVIEWER_TOKEN || supplied !== env.REVIEWER_TOKEN) throw new HttpError(401, 'unauthorized', '需要审核者认证。');
}

function row(value) { return { id: value.id, metadata: typeof value.metadata === 'string' ? JSON.parse(value.metadata) : value.metadata, status: value.status, publicFields: value.public_fields ? JSON.parse(value.public_fields) : value.publicFields || null, createdAt: value.created_at, updatedAt: value.updated_at }; }
function publicationRow(value) { return { id: value.id, submissionId: value.submission_id, operation: value.operation, status: value.status, pullRequestNumber: value.pull_request_number ?? null, pullRequestUrl: value.pull_request_url ?? null, branch: value.branch ?? null, commitSha: value.commit_sha ?? null, mergeCommitSha: value.merge_commit_sha ?? null, error: value.error ?? null, createdAt: value.created_at, updatedAt: value.updated_at }; }
function corsHeaders(origin) { return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}; }
function response(data, status, headers = {}) { return new Response(data === null ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } }); }
