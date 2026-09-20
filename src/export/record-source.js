import { FileRecordStore } from '../adapters/record-store.js';
import { PrivateImageStore } from '../adapters/image-store.js';

/**
 * 从注入的端口读取「已批准记录 + 已获公开授权的图片字节」。
 * 这是服务渠道导出唯一需要的数据源，不关心记录和图片到底存在哪里。
 */
export async function readApprovedRecordsFromAdapters({ repository, storage }) {
  const records = await repository.listRecords('approved');
  return Promise.all(records.map(async (record) => {
    const image = record.publicFields?.imageApproved && record.imageKey
      ? await storage.read(record.imageKey)
      : null;
    return { ...record, image };
  }));
}

/** 默认本地数据目录的便捷入口，保持 `--data-dir` 行为不变。 */
export async function readApprovedRecordsFromDataDir(dataDir) {
  return readApprovedRecordsFromAdapters({
    repository: new FileRecordStore({ root: dataDir }),
    storage: new PrivateImageStore({ root: dataDir }),
  });
}
