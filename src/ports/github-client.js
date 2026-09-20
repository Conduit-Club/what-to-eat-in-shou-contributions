/**
 * GitHubClient 端口：站点仓库 PR 操作契约。
 *
 * 导出管线通过该端口创建和查询 PR，不直接 import 任何 GitHub SDK。
 * createPullRequest({ head, base, title, body }) -> PR 对象
 * getPullRequest(number) -> PR 对象
 * closePullRequest(number) -> PR 对象
 *
 * 实现必须是对象，方法返回 Promise。
 */
export function assertGitHubClient(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    throw new TypeError('注入的 GitHubClient 必须是对象。');
  }
  for (const method of ['createPullRequest', 'getPullRequest', 'closePullRequest']) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`注入的 GitHubClient 缺少方法 ${method}()。`);
    }
  }
  return candidate;
}
