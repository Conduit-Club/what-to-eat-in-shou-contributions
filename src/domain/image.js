import { HttpError, invariant } from '../errors.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function detectImage(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { type: 'jpeg', extension: 'jpg' };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG)) return { type: 'png', extension: 'png' };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return { type: 'webp', extension: 'webp' };
  throw new HttpError(422, 'invalid_image', '图片必须为 JPEG、PNG 或 WebP。');
}

export function validateAndSanitizeImage(buffer) {
  invariant(buffer?.length, 422, 'missing_image', 'image 为必填项。');
  invariant(buffer.length <= MAX_IMAGE_BYTES, 413, 'image_too_large', '图片不能超过 5 MiB。');
  const image = detectImage(buffer);
  return { ...image, buffer: stripExif(buffer, image.type) };
}

function stripExif(buffer, type) {
  if (type === 'jpeg') return stripJpegExif(buffer);
  if (type === 'png') return stripPngExif(buffer);
  return stripWebpExif(buffer);
}

function stripJpegExif(buffer) {
  const output = [buffer.subarray(0, 2)]; let offset = 2;
  while (offset + 2 <= buffer.length && buffer[offset] === 0xff) {
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) return Buffer.concat([...output, buffer.subarray(offset)]);
    if (offset + 4 > buffer.length) throw new HttpError(422, 'invalid_image', 'JPEG 文件损坏。');
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) throw new HttpError(422, 'invalid_image', 'JPEG 文件损坏。');
    const segment = buffer.subarray(offset, offset + 2 + length);
    if (!(marker === 0xe1 && buffer.subarray(offset + 4, offset + 10).toString() === 'Exif\0\0')) output.push(segment);
    offset += 2 + length;
  }
  return Buffer.concat(output);
}

function stripPngExif(buffer) {
  const output = [buffer.subarray(0, 8)]; let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset); const end = offset + 12 + length;
    if (end > buffer.length) throw new HttpError(422, 'invalid_image', 'PNG 文件损坏。');
    if (buffer.subarray(offset + 4, offset + 8).toString() !== 'eXIf') output.push(buffer.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(output);
}

function stripWebpExif(buffer) {
  // 头部固定 12 字节：RIFF、小端长度、WEBP。复制一份再改，避免改到调用方传入的字节。
  const header = Buffer.from(buffer.subarray(0, 12));
  const chunks = []; let offset = 12;
  while (offset + 8 <= buffer.length) {
    // 块布局是 fourcc + 小端长度，长度在 offset + 4；以前读的是 offset，等于把 fourcc 当长度，
    // 每个 WebP 都被判成损坏文件，WebP 投稿全部失败。
    const size = buffer.readUInt32LE(offset + 4); const padded = size + (size % 2); const end = offset + 8 + padded;
    if (end > buffer.length) throw new HttpError(422, 'invalid_image', 'WebP 文件损坏。');
    if (buffer.subarray(offset, offset + 4).toString() !== 'EXIF') chunks.push(buffer.subarray(offset, end));
    offset = end;
  }
  const body = Buffer.concat(chunks);
  // RIFF 长度字段记录的是文件总长减 8，也就是 12 字节头部之后的内容再加 4。
  header.writeUInt32LE(body.length + 4, 4);
  return Buffer.concat([header, body]);
}
