# what-to-eat-in-shou-contributions

“今日海大吃什么”的贡献服务：接收餐厅信息投稿，提供受认证保护的审核台，把审核通过的内容交给导出器变成站点仓库的变更计划。公开站点始终从审核后的 Git 快照构建，不在运行时读取这里的任何数据。

## 结构

一个 Node 进程，一个数据目录，没有数据库、没有对象存储、没有第二个运行时，也没有第三方运行时依赖：

```text
src/main.js              进程入口，读环境变量后启动
src/http/server.js       六个接口加审核台页面
src/http/admin-ui.js     审核台，纯静态页
src/http/multipart.js    投稿请求体解析
src/domain/              元数据、图片、公开字段的校验
src/adapters/            record-store.js（投稿与审计）、image-store.js（私有原图）
src/export/              站点变更计划、GitHub PR 客户端
scripts/plan-export.js   导出命令
```

数据目录：

```text
<数据目录>/records/<投稿 ID>.json    所有投稿，status 决定状态
<数据目录>/images/<随机>.jpg         私有原图
<数据目录>/audits/<时间>-<随机>.json  审核审计，只追加
```

状态写在记录里而不是目录名里，所以审核就是改一个文件的内容，没有「搬到一半」的中间态；代价是列出待审要读完所有记录，校园投稿量下是几十个文件。

## 环境与命令

仓库用 Pixi 固定 Node.js 22，不需要全局安装 Node、npm 或 pnpm：

```bash
pixi install
pixi run install
pixi run test
pixi run check
DATA_DIR=.data REVIEWER_TOKENS=local-dev-token ALLOWED_ORIGINS=http://localhost:3000 pixi run start
```

默认监听 `3001`，数据目录默认 `.data`，它必须在仓库外或已被忽略，不要提交。生产只需再加 HTTPS 与反向代理：

```bash
PORT=3001 DATA_DIR=/var/lib/shou-contributions \
REVIEWER_TOKENS=<强随机令牌> ALLOWED_ORIGINS=https://<站点来源> pixi run start
```

限流按来源地址在进程内计数，单实例够用；要多实例时应在反向代理或网关上做限流。

## API

`POST /v1/submissions` 接受 `multipart/form-data` 的 `metadata`（JSON 字符串）和一张 `image`。图片必须是真实 JPEG、PNG 或 WebP，且不超过 5 MiB；服务端自行判断字节格式并移除可移除的 EXIF，不信任文件名与声明的 MIME。成功只表示进入审核队列：`202 {"id":"...","status":"pending"}`。

审核接口位于 `/v1/admin/submissions`，使用 `Authorization: Bearer <token>`。完整机器可读契约见 [openapi.yaml](./openapi.yaml)，两条投稿渠道与审核约定见 [submission-channels.md](./submission-channels.md)，安全边界与后续导出要求见 [contribution-service-handoff.md](./contribution-service-handoff.md)。

## 审核台

打开 `/admin/`。填入 `REVIEWER_TOKENS` 中的任一令牌即可加载待审列表、查看投稿图片、批准或拒绝。

令牌由审核者手动输入，只保存在当前标签页的 `sessionStorage`，页面和仓库都不写入凭据；图片走 `GET /v1/admin/submissions/{id}/image`，同样需要令牌。批准时页面要求填写稳定标识、名称、位置和以「同学反馈：」开头的口感，并明确勾选图片是否获准公开。

## 两条投稿渠道

不需要 GitHub 账号的同学用投稿服务；已经登录 GitHub 的同学用仓库的 Issue 表单。两条渠道在导出前汇成同一个 `records` 数组，计划生成完全共用：

```bash
# 服务渠道：直接读数据目录里已批准的记录
pixi run node scripts/plan-export.js --data-dir .data --site ../what-to-eat-in-shou-today --out /tmp/shou-plan

# Issue 渠道或人工整理的批次
pixi run node scripts/plan-export.js --records data/reviewed/canteen-windows-2026-09.json --site ../what-to-eat-in-shou-today --out /tmp/shou-plan
```

细节见 [submission-channels.md](./submission-channels.md)。

## 导出计划

`src/export/site-plan.js` 的 `createNewRestaurantPlan({record, image, site})` 为新店生成快照、详情、索引、侧边栏及可选图片的内存变更清单。`site` 提供 `restaurantsJson`、`categoryIndex`、`sidebars` 和完整的 `existingPaths`，`image.buffer` 必须是审核通过的处理后图片，调用方负责提供同一站点版本的输入。重复餐厅 ID 或详情路径会拒绝生成；只支持包含静态文档 ID 的侧边栏分类列表。

`plan-export.js` 只读站点仓库、只写输出目录，不创建分支、不推送、不开 PR。已有餐厅追加、导出审计和自动发布尚未实现，计划器测试也不能替代站点构建与图片授权的人工核验。本轮审核过程与已知差异见 [reviewed-content.md](./reviewed-content.md)。

## 部署

步骤、所需环境变量与 CI 说明见 [deployment.md](./deployment.md)。`.github/workflows/verify.yml` 在 PR 与推送到 `main` 时运行检查与测试。
