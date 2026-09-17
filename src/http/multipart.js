import { HttpError, invariant } from '../errors.js';

export async function parseSubmissionMultipart(request) {
  const header = request.headers['content-type'] || '';
  const match = /^multipart\/form-data;\s*boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(header);
  invariant(match, 400, 'invalid_content_type', 'Content-Type 必须为 multipart/form-data。');
  const body = await readBody(request, 5 * 1024 * 1024 + 300 * 1024);
  const boundary = Buffer.from(`--${match[1] || match[2]}`); const parts = []; let position = 0;
  while (true) {
    const start = body.indexOf(boundary, position); if (start === -1) break;
    const contentStart = start + boundary.length;
    if (body.subarray(contentStart, contentStart + 2).toString() === '--') break;
    const headersStart = contentStart + 2; const separator = body.indexOf(Buffer.from('\r\n\r\n'), headersStart);
    if (separator === -1) throw new HttpError(400, 'invalid_multipart', 'multipart 内容无效。');
    const next = body.indexOf(boundary, separator + 4); if (next === -1) throw new HttpError(400, 'invalid_multipart', 'multipart 内容无效。');
    const headers = body.subarray(headersStart, separator).toString('utf8'); const content = body.subarray(separator + 4, next - 2);
    const disposition = /name="([^"]+)"(?:;\s*filename="([^"]*)")?/i.exec(headers);
    if (!disposition) throw new HttpError(400, 'invalid_multipart', 'multipart 缺少字段名称。');
    parts.push({ name: disposition[1], filename: disposition[2] ?? null, content }); position = next;
  }
  const metadata = parts.filter((part) => part.name === 'metadata'); const images = parts.filter((part) => part.name === 'image');
  invariant(metadata.length === 1 && images.length === 1 && parts.length === 2, 400, 'invalid_multipart', '必须且只能提供 metadata 和 image。');
  return { metadata: metadata[0].content.toString('utf8'), image: images[0].content };
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    request.on('data', (chunk) => { size += chunk.length; if (size > maxBytes) { reject(new HttpError(413, 'image_too_large', '请求体超过大小上限。')); request.destroy(); } else chunks.push(chunk); });
    request.on('end', () => resolve(Buffer.concat(chunks))); request.on('error', reject);
  });
}
