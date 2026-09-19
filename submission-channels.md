# 投稿渠道

餐厅信息有两条进来的路，出口只有一个。

## 渠道一：投稿服务（主渠道，不需要 GitHub 账号）

学生在站点上填表，服务接收、保存私有原图，维护者在 `/admin/` 里看图、批准或拒绝。批准后的记录留在服务的数据目录里：

```text
<数据目录>/records/<投稿 ID>.json   所有投稿，status 决定状态
<数据目录>/images/<随机>.jpg        私有原图
<数据目录>/audits/<时间>-<随机>.json 审核审计
```

导出时直接读这个目录，不必先导出成中间文件：

```bash
pixi run node scripts/plan-export.js --data-dir <数据目录> --site ../what-to-eat-in-shou-today --out /tmp/shou-plan
```

## 渠道二：GitHub Issue（已登录 GitHub 的同学）

用仓库的 Issue 表单提交。维护者在 Issue 里核对内容，必要时在评论里追问，然后把定稿写进 `data/reviewed/<批次>.json`：

```json
{
  "schemaVersion": 1,
  "kind": "reviewed-restaurant-records",
  "collectedAt": "2026-09-19",
  "source": { "type": "github-issue", "url": "https://github.com/<owner>/<repo>/issues/<编号>", "note": "投稿人自述，图片为其本人拍摄并授权公开。" },
  "records": [
    {
      "status": "approved",
      "imageKey": null,
      "image": null,
      "publicFields": {
        "id": "first-canteen-tie-ban-fan",
        "name": "一餐 铁板饭",
        "category": "on-campus",
        "location": "第一食堂一楼，靠近回收餐盘处",
        "taste": "同学反馈：铁板鸡排 8 元，现点现煎。",
        "openingHours": null,
        "visitedAt": "2026-09-19",
        "updatedAt": null,
        "price": "铁板鸡排 8 元一份。",
        "imageApproved": false
      }
    }
  ]
}
```

再用同一个导出命令处理这一批：

```bash
pixi run node scripts/plan-export.js --records data/reviewed/<批次>.json --site ../what-to-eat-in-shou-today --out /tmp/shou-plan
```

`imageApproved` 为 `true` 时必须另有一张可公开的图片；Issue 渠道把图片放到站点仓库后再导出，或者先在服务里补一条记录。

## 两条渠道的约定

`id` 是小写英文或拼音加连字符的稳定标识，一旦发布就不再改，它同时是详情页文件名。`taste` 一律以「同学反馈：」开头，用来区分同学投稿与维护者核验的内容。`updatedAt` 只在真的去现场核验过事实时填写。

导出只生成变更计划，不写站点仓库、不创建 PR；PR 由人或 GitHub Actions 从计划创建，合并即发布。
