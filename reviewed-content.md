# 本轮审核记录与导出审计（2026-09-19）

本文记录“今日海大吃什么”本轮内容变更在贡献服务侧的审核结果与导出过程。公开站点内容不在本仓库发布，这里只保存审核记录、导出命令和差异说明。

## 数据来源与边界

- 来源是小红书上一则上海海洋大学一餐、二餐美食推荐帖子及其评论的公开截图，2026-09-19 读取整理。
- 只整理公开可见的窗口、餐品和同学自己说出的价格；发言者身份未核实，站点上沿用匿名署名 A–E，不公开账号名。
- 没有取得截图或原图的再利用授权，因此三条记录的 `imageApproved` 全部为 `false`，导出计划不会写入 `website/static/img/`。
- 帖子里“整体都比一餐好吃很多”一类表述保留原意，没有扩写成普遍结论。

## 审核记录

`data/reviewed/canteen-windows-2026-09.json` 是本轮的审核结果，`schemaVersion` 为 1，`records` 中每条对应一个准备公开的餐厅：

| `id` | 名称 | 分类 | 已知价格 | 图片 |
| --- | --- | --- | --- | --- |
| `first-canteen` | 一食堂 | `on-campus` | 铁板饭/铁板鸡排约 8 元/份，锅贴约 1–1.5 元/个，酸菜鱼约 19 元/份 | 未批准 |
| `second-canteen` | 二食堂 | `on-campus` | 风味餐厅牛肉面约 8 元/碗 | 未批准 |
| `flavor-restaurant` | 风味餐厅 | `on-campus` | 牛肉面约 8 元/碗 | 未批准 |

`visitedAt` 与 `updatedAt` 都是 `null`：帖子没有说用餐日期，审核者也没有现场核验窗口和现价，不能用投稿时间或整理日期冒充。

## 导出命令与结果

导出器对照的站点版本是本轮内容变更之前的 `what-to-eat-in-shou-today` 修订 `e721e20`（`main` 与同步后的 `dev`）：

```bash
pixi run node scripts/plan-export.js \
  --records data/reviewed/canteen-windows-2026-09.json \
  --site ../what-to-eat-in-shou-today \
  --out /tmp/shou-plan
```

命令只读站点仓库、只写输出目录，不创建分支、不推送、不开 PR。三条记录各生成 4 项变更：

```text
website/src/data/restaurants.json
website/docs/on-campus/<id>.md
website/docs/on-campus/index.md
website/sidebars.ts
```

## 与站点侧实际内容的差异

`restaurants.json`、`index.md` 与 `sidebars.ts` 的**结构**由导出器决定，站点侧按同样的结构落地；细节上仍有差异，需要在评审时知情：

- 详情页正文由人工按 `AGENTS.md` 的栏目格式撰写，保留了多条匿名评价、价格分项和“待补充”说明。当前导出模板只能把 `taste` 写成一段引用，无法表达多条评价，因此导出结果不是逐字可用的正文。
- 导出器会把 `price` 中的 `-` 和换行转义成 HTML 实体（防止投稿内容注入 Markdown/MDX），落地时改回了正常列表排版；`taste`、`location` 等字段的取值与站点一致。
- `restaurants.json` 的条目顺序不同：导出器按 `id` 排序，站点侧按人工阅读顺序排列。
- `sidebars.ts` 的缩进不同，条目集合一致。

结论：本轮的导出计划用于核对快照、分类索引和侧边栏的记账是否完整，**不能当作逐字节生成器**；逐字落地仍以站点仓库 PR 为准。

## 尚未实现

- 尚未把审核记录真正落到 D1 / PostgreSQL；`data/reviewed/` 只是本轮的可审计种子文件。
- 尚未实现已有餐厅的追加导出、导出审计表、重复发布检测和 GitHub PR 自动化。
- 尚未接入图片授权流程，因此带图条目无法导出。
