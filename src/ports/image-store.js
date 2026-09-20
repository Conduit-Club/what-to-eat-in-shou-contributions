/**
 * ImageStore 端口：私有原图的存储契约。
 *
 * 服务核心只依赖这个端口；具体实现由外部仓库提供，并在组合根注入。
 *
 * put(image) -> key
 *   image 是 domain 校验并清洗后的对象：{ buffer: Buffer, extension: 'jpg'|'png'|'webp' }
 *   返回的 key 必须是服务端生成的不透明字符串，绝不从投稿文件名派生。
 *
 * read(key) -> { buffer: Buffer, contentType: string }
 *   键不存在时抛 404；键本身非法时抛 400。
 *
 * 实现必须是对象，方法全部返回 Promise。
 */
export function assertImageStore(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('注入的 ImageStore 必须是对象。');
  }
  for (const method of ['put', 'read']) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`注入的 ImageStore 缺少方法 ${method}()。`);
    }
  }
  return candidate;
}
