# 适配器注入契约

本仓库的服务核心只依赖抽象端口（投稿记录、私有图片、审核审计、匿名限流、时间、ID 生成、GitHub PR 客户端），不 import 具体存储实现。具体实现由外部仓库提供，在本仓库的组合根注入。公开站点仍然只从审核后的 Git 快照构建，不在运行时读取任何存储实现。

## 组合根

`src/composition.js` 是唯一把端口接到具体实现的地方：

- 未设置 `CONTRIB_ADAPTERS`：使用仓库自带的本地文件适配器（开发与单机部署）。
- 设置 `CONTRIB_ADAPTERS`：加载外部模块，并校验模块导出的对象满足端口契约。

服务入口 `src/main.js` 和导出命令 `scripts/plan-export.js` 都通过组合根取得适配器，不直接实例化具体实现。

## 注入方式

运行服务：

```bash
CONTRIB_ADAPTERS=<模块> \
DATA_DIR=<实现所需目录或配置> \
REVIEWER_TOKENS=<令牌> \
ALLOWED_ORIGINS=https://<站点来源> \
pixi run start
```

导出命令：

```bash
pixi run node scripts/plan-export.js --adapter <模块> [--data-dir <目录>] --site <站点仓库路径> [--out <输出目录>]
```

模块可以是 ESM 文件路径、`file://` URL，或已安装到 `node_modules` 的包名。加载顺序：先按原样 `import(specifier)`；失败且看起来是文件路径时，再转成 `pathToFileURL` 加载。

## 模块形状

外部模块推荐导出一个工厂：

```js
export async function createAdapters({ env, dataDir }) {
  return {
    repository: new PostgresRecordStore({ url: env.DATABASE_URL }),
    storage: new R2ImageStore({ bucket: env.IMAGE_BUCKET }),
    auditLog: new PostgresAuditLog({ url: env.DATABASE_URL }),
    rateLimiter: new RedisRateLimiter({ url: env.REDIS_URL }),
    clock: new SystemClock(),
    idGenerator: new CryptoIdGenerator(),
    github: new GitHubClient({ owner: env.GITHUB_OWNER, repository: env.GITHUB_REPOSITORY, token: env.GITHUB_TOKEN }),
  };
}
```

也可以直接导出对象：

```js
export default {
  repository: new PostgresRecordStore(),
  storage: new R2ImageStore(),
  auditLog: new PostgresAuditLog(),
  rateLimiter: new RedisRateLimiter(),
  clock: new SystemClock(),
  idGenerator: new CryptoIdGenerator(),
  github: new GitHubClient(),
};
```

字段别名：`repository` 等价于 `recordStore`，`storage` 等价于 `imageStore`，`idGenerator` 等价于 `idGen`。`rateLimiter`、`clock`、`idGenerator` 缺省时使用内置单机实现；`auditLog` 必须由外部实现提供，`github` 可选（未提供时导出器不创建 PR）。

## 端口契约

端口定义与运行时校验位于 `src/ports/`。

### RecordStore

投稿记录仓储，所有方法返回 Promise：

- `create(metadata, imageKey)`：写入一条 `status: 'pending'` 的记录，返回完整记录。
- `get(id)`：按 ID 返回完整记录；不存在时抛 `status = 404`。
- `list(status?)`：返回公开投影记录，不得包含 `imageKey`。
- `listRecords(status?)`：返回完整记录（含 `imageKey`），只供导出管线等可信内部消费者使用；导出模式必选。
- `review(id, action, reviewer, reason, publicFields, reviewedAt)`：只负责持久化审核结果，把状态改为 `approved` 或 `rejected` 并写入 `updatedAt`。审核校验与「先审计后记录」由 `src/domain/review.js` 负责。

记录形状：

```json
{
  "id": "uuid",
  "metadata": { "schemaVersion": 1 },
  "imageKey": "images/uuid.jpg",
  "status": "pending",
  "publicFields": null,
  "createdAt": "2026-09-19T13:50:21.854Z",
  "updatedAt": "2026-09-19T13:50:21.854Z"
}
```

### ImageStore

私有原图存储：

- `put(image)`：接收 `{ buffer, extension }`，返回服务端生成的不透明键。
- `read(key)`：返回 `{ buffer, contentType }`；键非法抛 400，不存在抛 404。

### AuditLog

审核审计只追加日志：

- `append(entry)`：`entry` 含 `submissionId`、`action`、`reviewer`、`reason`、`createdAt`，返回带 `id` 的完整审计。
- `list()`：按 `createdAt` 升序返回全部审计。

### RateLimiter

匿名投稿限流：

- `enforce(key)`：允许时什么都不返回；超限时抛 `status = 429`、`code = 'rate_limited'` 的错误。

### Clock

时间来源：

- `now()`：返回 ISO 8601 字符串。

### IdGenerator

ID 生成：

- `randomId()`：返回不透明字符串。

### GitHubClient

站点仓库 PR 操作（导出器使用）：

- `createPullRequest({ head, base, title, body })`。
- `getPullRequest(number)`。
- `closePullRequest(number)`。

## 错误约定

外部实现需要抛出与本仓库 `src/errors.js` 的 `HttpError` 兼容的错误对象：带 `status`、`code`、`message` 三个字段。否则 HTTP 层会把错误当作 500 处理，匿名调用方只会看到「服务暂时不可用」。

## 保持不变的边界

- 服务 HTTP 契约以 `openapi.yaml` 为准，注入层不改变路由、状态码和响应结构。
- 两条投稿渠道仍汇成同一份 `records` 交给导出器。
- 审核台 `/admin/` 的令牌仍只保存在浏览器 `sessionStorage`，不进入存储实现。
- 公开站点仍从 Git 快照构建，不依赖运行时数据库。
