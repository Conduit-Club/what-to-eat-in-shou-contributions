/** IdGenerator 端口的默认实现：Web Crypto 的 randomUUID，Node 22 与 Workers 都可用。 */
export class CryptoIdGenerator {
  constructor({ randomId = () => globalThis.crypto.randomUUID() } = {}) {
    this.randomId = randomId;
  }
}
