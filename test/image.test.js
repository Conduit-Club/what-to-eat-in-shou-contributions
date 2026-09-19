import assert from 'node:assert/strict';
import test from 'node:test';
import { detectImage, validateAndSanitizeImage } from '../src/domain/image.js';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const pngChunk = (type, data) => Buffer.concat([Buffer.from([0, 0, 0, data.length]), Buffer.from(type), data, Buffer.alloc(4)]);
const webpChunk = (type, data) => Buffer.concat([Buffer.from(type), Buffer.from([data.length, 0, 0, 0]), data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
const riff = (body) => Buffer.concat([Buffer.from('RIFF'), Buffer.from([body.length + 4, 0, 0, 0]), Buffer.from('WEBP'), body]);

const jpegWithExif = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0c]), Buffer.from('Exif\0\0'), Buffer.from([1, 2, 3, 4]), Buffer.from([0xff, 0xda, 0x00, 0x08]), Buffer.from('scan')]);
const jpegWithoutExif = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x06]), Buffer.from('JFIF'), Buffer.from([0xff, 0xda, 0x00, 0x08]), Buffer.from('scan')]);
const pngWithExif = Buffer.concat([pngSignature, pngChunk('IHDR', Buffer.from([1, 2, 3])), pngChunk('eXIf', Buffer.from([9, 9])), pngChunk('IDAT', Buffer.from([7]))]);
const pngWithoutExif = Buffer.concat([pngSignature, pngChunk('IHDR', Buffer.from([1, 2, 3])), pngChunk('IDAT', Buffer.from([7]))]);
const webpWithExif = riff(Buffer.concat([webpChunk('VP8 ', Buffer.from([1, 2])), webpChunk('EXIF', Buffer.from([5, 5, 5]))]));
const webpWithoutExif = riff(webpChunk('VP8 ', Buffer.from([1, 2])));

test('detects the three accepted formats and rejects everything else', () => {
  assert.deepEqual(detectImage(jpegWithExif), { type: 'jpeg', extension: 'jpg' });
  assert.deepEqual(detectImage(pngWithExif), { type: 'png', extension: 'png' });
  assert.deepEqual(detectImage(webpWithExif), { type: 'webp', extension: 'webp' });
  assert.throws(() => detectImage(Buffer.from('not an image')), (error) => error.status === 422 && error.code === 'invalid_image');
  assert.throws(() => validateAndSanitizeImage(Buffer.alloc(0)), (error) => error.code === 'missing_image');
});

test('strips JPEG and PNG metadata while keeping the rest of the file', () => {
  assert.deepEqual(validateAndSanitizeImage(jpegWithExif).buffer, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08]), Buffer.from('scan')]));
  assert.deepEqual(validateAndSanitizeImage(jpegWithoutExif).buffer, jpegWithoutExif);
  assert.deepEqual(validateAndSanitizeImage(pngWithExif).buffer, pngWithoutExif);
});

test('strips the WebP EXIF chunk, repairs the RIFF size and leaves the input untouched', () => {
  const input = Buffer.from(webpWithExif);
  const output = validateAndSanitizeImage(input).buffer;
  assert.deepEqual(output, webpWithoutExif);
  assert.equal(output.readUInt32LE(4), output.length - 8, 'RIFF 长度字段必须与清洗后的文件一致');
  assert.deepEqual(input, webpWithExif, '清洗过程不能修改调用方传入的字节');
});

test('reports damaged files and oversized images with stable error codes', () => {
  assert.throws(() => validateAndSanitizeImage(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x40])), (error) => error.code === 'invalid_image');
  assert.throws(() => validateAndSanitizeImage(Buffer.concat([pngSignature, Buffer.from([0, 0, 0, 99]), Buffer.from('IHDR'), Buffer.alloc(4)])), (error) => error.code === 'invalid_image');
  assert.throws(() => validateAndSanitizeImage(Buffer.concat([Buffer.from('RIFF'), Buffer.from([4, 0, 0, 0]), Buffer.from('WEBP'), Buffer.from('EXIF'), Buffer.from([244, 1, 0, 0])])), (error) => error.code === 'invalid_image');
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
  oversized.set([0xff, 0xd8, 0xff, 0xd9]);
  assert.throws(() => validateAndSanitizeImage(oversized), (error) => error.status === 413 && error.code === 'image_too_large');
});
