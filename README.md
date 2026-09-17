# what-to-eat-in-shou-contributions

当前前端集成能力：批准接口要求 `publicFields.id`（稳定餐厅标识）和
`publicFields.imageApproved`（明确的图片公开决定）。公开 `updatedAt` 默认 `null`，
仅在实际核验事实时填写，不能使用投稿记录更新时间代替。

`src/export/site-plan.js` 的 `createNewRestaurantPlan({record, image, site})`
为新店生成快照、详情、索引、侧边栏及可选图片的内存变更清单。
`site` 提供 `restaurantsJson`、`categoryIndex`、`sidebars` 和完整的 `existingPaths`；
`image.buffer` 必须是审核通过的处理后图片。调用方负责提供同一站点版本的输入。
重复餐厅 ID 或详情路径会拒绝生成；只支持包含静态文档 ID 的侧边栏分类列表。
此函数不写文件、不创建 PR。已有餐厅追加、导出审计和可重试的 GitHub PR 工作流尚未实现。
计划器测试尚不能替代站点构建及图片授权的人工核验。

“今日海大吃什么”的独立贡献服务。它接收匿名投稿，在私有区域保存待审图片，并提供受认证保护的审核 API；公开站点始终从审核后的 Git 快照构建。

## 环境与命令

仓库使用 Pixi 固定 Node.js 22 和 pnpm，不需要全局安装 Node、npm 或 pnpm：

```bash
pixi install
pixi run install
pixi run test
pixi run check
pixi run start
```

默认运行在 `http://localhost:3001`，使用 `.data/private` 作为仅适于本地开发的私有存储目录和内存投稿仓储。生产设置 `DATABASE_URL` 后必须同时设置 `S3_BUCKET`、`S3_REGION`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`（可选 `S3_ENDPOINT`），服务会自动建表并切换到 PostgreSQL/S3。另须设置 HTTPS、逗号分隔的 `ALLOWED_ORIGINS` 与强随机 `REVIEWER_TOKENS`；不要将 `.data/` 或环境文件提交到仓库。

## API

`POST /v1/submissions` 接受 `multipart/form-data` 的 `metadata`（JSON 字符串）和一张 `image`。图片必须是真实 JPEG、PNG 或 WebP，且不超过 5 MiB。成功只表示进入审核队列：`202 {"id":"...","status":"pending"}`。

审核接口位于 `/v1/admin/submissions`，使用 `Authorization: Bearer <token>`。完整机器可读契约见 [openapi.yaml](./openapi.yaml)，安全边界与后续 PostgreSQL/S3/PR 导出要求见 [contribution-service-handoff.md](./contribution-service-handoff.md)。
