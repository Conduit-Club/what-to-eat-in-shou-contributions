/** 私有存储键的扩展名决定响应类型。单独成模块，避免 Worker 入口间接依赖 Node HTTP 服务。 */
export function imageContentType(key) { const extension = String(key || '').split('.').pop()?.toLowerCase(); return extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg'; }
