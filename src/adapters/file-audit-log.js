import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * AuditLog 端口的默认实现：`<root>/audits/<时间>-<随机>.json` 只追加。
 * 与旧文件布局兼容，迁移时可直接指向原数据目录的 root。
 */
export class FileAuditLog {
  constructor({ root, idGenerator }) {
    this.root = resolve(root);
    this.idGenerator = idGenerator;
  }

  #auditsDir() { return join(this.root, 'audits'); }
  #auditPath(audit) { return join(this.#auditsDir(), `${audit.createdAt.replace(/:/g, '')}-${audit.id}.json`); }

  async append(entry) {
    const audit = { id: this.idGenerator.randomId(), ...entry };
    await mkdir(this.#auditsDir(), { recursive: true, mode: 0o700 });
    await writeFile(this.#auditPath(audit), `${JSON.stringify(audit, null, 2)}\n`, { mode: 0o600 });
    return audit;
  }

  async list() {
    const files = await readdir(this.#auditsDir()).catch(() => []);
    const audits = [];
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      audits.push(JSON.parse(await readFile(join(this.#auditsDir(), file), 'utf8')));
    }
    return audits.sort((left, right) => (left.createdAt < right.createdAt ? -1 : 1));
  }
}
