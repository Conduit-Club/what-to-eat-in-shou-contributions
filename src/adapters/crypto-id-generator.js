import { randomUUID } from 'node:crypto';

/** IdGenerator 端口的默认实现：crypto.randomUUID。 */
export class CryptoIdGenerator {
  constructor({ randomId = () => randomUUID() } = {}) {
    this.randomId = randomId;
  }
}
