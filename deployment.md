# 部署方案

本文给出“今日海大吃什么”两个仓库的部署方案、可直接执行的命令，以及当前仍未满足的前置条件。文中所有命令都没有在本机对真实 Cloudflare 账号执行过，仓库里也还没有任何已配置的部署流水线；请把它当成本地方案而不是已经上线的部署。

## 现状与问题

| 问题 | 现状 |
| --- | --- |
| 公开站点没有部署目标 | 只有 `website/wrangler.jsonc`（Workers Static Assets）蓝本，没有账号、路由、`SITE_URL` 或自定义域名 |
| 站点没有 CI | 默认分支上没有 workflow，Actions 里 0 个 workflow，`website/tests/site.spec.ts` 也从未在 CI 跑过 |
| 贡献服务没有部署 | `wrangler.jsonc` 的 `database_id` 仍是 `REPLACE_WITH_D1_DATABASE_ID`，没有 D1、R2、`REVIEWER_TOKEN` 或 `ALLOWED_ORIGINS` |
| 前端没有投稿地址 | 未设置 `CONTRIBUTION_API_URL`，投稿表单只能导出草稿 |
| 没有发布回路 | 审核通过后如何触发站点重建、如何创建站点 PR，都还没有落地的自动化 |

## 目标形态

```text
浏览器
  ├─ 静态站点：Cloudflare Workers Static Assets（website/build）
  └─ 投稿：Cloudflare Worker（本仓库 src/worker.js）
                ├─ D1：投稿元数据与发布任务
                └─ R2（私有）：待审图片
                        ↓ 审核通过
                导出任务生成站点 PR → 站点仓库 dev → main → 重新构建静态站点
```

## 前置条件

- Cloudflare 账号，且有 Workers、D1、R2 权限的 API Token。
- 一个可用的站点域名或 `*.workers.dev` 子域，作为 `ALLOWED_ORIGINS` 与站点 `url`。
- GitHub 仓库密钥：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`；站点仓库另需 `SITE_URL`、`CONTRIBUTION_API_URL` 等仓库变量。

## 步骤

### 1. 创建 D1 与 R2

```bash
pnpm dlx wrangler@4 d1 create what-to-eat-in-shou-contributions
pnpm dlx wrangler@4 r2 bucket create what-to-eat-in-shou-contributions-pending
```

把返回的 `database_id` 写回 `wrangler.jsonc`，替换 `REPLACE_WITH_D1_DATABASE_ID`。

### 2. 应用迁移

```bash
pnpm dlx wrangler@4 d1 migrations apply what-to-eat-in-shou-contributions --local
pnpm dlx wrangler@4 d1 migrations apply what-to-eat-in-shou-contributions --remote
```

### 3. 配置密钥与允许来源

```bash
pnpm dlx wrangler@4 secret put REVIEWER_TOKEN
# ALLOWED_ORIGINS 在 wrangler.jsonc 的 vars 中填写，逗号分隔，只列站点真实来源
```

本地开发复制 `.dev.vars.example` 为 `.dev.vars`，不要提交。

### 4. 部署贡献服务

```bash
pixi run check
pixi run test
pnpm dlx wrangler@4 deploy
```

`README.md` 末尾的 Node/PostgreSQL/S3 入口继续用于本地开发和迁移期验证，生产以 Workers + D1 + R2 为准。

### 5. 把站点指向贡献服务

站点仓库构建时设置：

```bash
SITE_URL=https://<站点域名> BASE_URL=/ CONTRIBUTION_API_URL=https://<worker 域名>/v1/submissions pixi run build
```

`CONTRIBUTION_API_URL` 必须是完整 HTTP(S) 地址，否则 `docusaurus.config.ts` 会直接报错；未完成联调前不要填占位地址。

### 6. CI 与部署

仓库内提供两个 workflow：

- `.github/workflows/verify.yml`：PR 与 push 到 `main` 时运行 `pixi run check` 与 `pixi run test`，不需要任何密钥。
- `.github/workflows/deploy-worker.yml`：`main` 推送或手动触发；先跑检查，再在没有 `CLOUDFLARE_API_TOKEN` 时跳过部署并给出提示。

部署任务只有在配置了 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID` 之后才会真正执行；未配置时整个 job 跳过，不会产生失败的红叉。

## 尚未完成

- 没有在本机验证过 `wrangler deploy`、D1 迁移和 R2 绑定，方案中的命令需要在配置好账号后实测一次。
- 审核通过后的自动导出、站点 PR 创建与重复发布检测尚未实现；当前导出仍是本地命令 `scripts/plan-export.js`。
- CORS 与限流需要按真实站点来源复核；匿名接口保持无 Cookie 凭据。
