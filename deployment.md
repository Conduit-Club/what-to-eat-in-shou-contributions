# 部署方案

本文给出“今日海大吃什么”两个仓库的部署方式与命令，并说明已经验证过和还没有验证的部分。

## 形态

贡献服务是一个 Node 进程加一个数据目录，没有数据库、对象存储和第二个运行时，因此部署就是「把进程跑起来，把目录挂上」：

```text
浏览器
  ├─ 静态站点：任意静态托管（Cloudflare Pages、对象存储静态站点、Nginx 均可）
  ├─ 投稿与审核：贡献服务（Node 进程）
  │     └─ 数据目录：records/ images/ audits/
  └─ 审核通过后：导出命令生成变更计划 → 站点仓库 PR → 合并 → 重新构建静态站点
```

服务只需要一个能跑 Node 22 的地方，校内服务器、云主机、容器平台都可以。数据目录必须在仓库外，并纳入备份；备份就是打包这个目录。

## 环境变量

```bash
PORT=3001                                  监听端口
DATA_DIR=/var/lib/shou-contributions       数据目录，必须在仓库外
REVIEWER_TOKENS=<强随机令牌>                逗号分隔，可轮换
ALLOWED_ORIGINS=https://<站点来源>          逗号分隔，匿名投稿只接受这些来源
```

生产必须放在 HTTPS 反向代理之后。限流在进程内按来源地址计数，单实例有效；多实例需要把限流挪到代理或网关。

## 步骤

```bash
# 1. 取代码并准备环境
git clone <仓库地址> && cd what-to-eat-in-shou-contributions
pixi install

# 2. 先验证
pixi run check
pixi run test

# 3. 起服务
PORT=3001 DATA_DIR=/var/lib/shou-contributions \
REVIEWER_TOKENS=<强随机令牌> ALLOWED_ORIGINS=https://<站点来源> \
pixi run start
```

站点仓库构建时设置 `CONTRIBUTION_API_URL=https://<服务域名>/v1/submissions`；该值必须是完整 HTTP(S) 地址，否则 `docusaurus.config.ts` 会直接报错，未完成联调前不要填占位地址。

导出与发布：

```bash
pixi run node scripts/plan-export.js --data-dir /var/lib/shou-contributions \
  --site ../what-to-eat-in-shou-today --out /tmp/shou-plan
```

计划文件确认无误后，由人或 GitHub Actions 创建站点仓库 PR，合并后再重建静态站点。计划命令本身不推送、不开 PR。

## 已验证与未验证

已验证：本地跑通投稿、审核台、审核与拒绝、私有图片、按来源限流、同源审核，以及两条投稿渠道的导出计划；`pixi run check`、`pixi run test` 与 `git diff --check` 均通过。

未验证：没有任何真实部署；进程守护方式、反向代理配置、备份与恢复流程、多实例限流都还没有实施。站点仓库的自动发布仍未实现。

## CI

`.github/workflows/verify.yml` 在 PR 与推送到 `main` 时运行 `pixi run check`、`pixi run test` 与 `git diff --check`，不需要任何密钥。
