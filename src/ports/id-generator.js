/**
 * IdGenerator 端口：稳定 ID 生成契约。
 *
 * 服务核心与默认适配器不直接调用 crypto.randomUUID；需要新 ID 时
 * 通过该端口取得。randomId() 返回不透明字符串。
 */
export function assertIdGenerator(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('注入的 IdGenerator 必须是对象。');
  }
  if (typeof candidate.randomId !== 'function') {
    throw new TypeError('注入的 IdGenerator 缺少方法 randomId()。');
  }
  return candidate;
}
