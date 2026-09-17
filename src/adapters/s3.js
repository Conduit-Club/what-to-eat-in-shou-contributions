import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

export class S3PrivateStorage {
  constructor({ bucket, endpoint, region, accessKeyId, secretAccessKey }) { this.bucket = bucket; this.client = new S3Client({ endpoint, region, forcePathStyle: Boolean(endpoint), credentials: { accessKeyId, secretAccessKey } }); }
  async putPending(image) { const key = `pending/${randomUUID()}.${image.extension}`; await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: image.buffer, ContentType: `image/${image.type}`, ACL: 'private' })); return key; }
  async get(key) { const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key })); return Buffer.from(await result.Body.transformToByteArray()); }
}
