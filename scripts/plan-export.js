#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { createPlansFromRecords, parseReviewedRecords, readApprovedRecords, readSiteContext } from '../src/export/plan-collection.js';

const usage = `用法：node scripts/plan-export.js (--records <审核记录.json> | --data-dir <服务数据目录>) --site <站点仓库路径> [--out <输出目录>]

两个投稿渠道共用这一个出口：
  --records    GitHub Issue 渠道或人工整理的审核记录集合
  --data-dir   贡献服务的数据目录，读取其中已批准的记录与对应图片
读取审核记录与站点仓库文件，为每条记录生成站点变更计划。
该命令只读站点仓库、只写输出目录，不创建分支、不推送、不开 PR。`;

async function main(argv) {
  const options = parseArgs(argv);
  const records = options.records
    ? parseReviewedRecords(JSON.parse(await readFile(options.records, 'utf8'))).records
    : await readApprovedRecords(options.dataDir);
  if (!records.length) {
    process.stdout.write('没有已批准的记录，未生成任何计划。\n');
    return;
  }
  const site = await readSiteContext(options.site);
  const plans = createPlansFromRecords({ records, site });
  const summary = plans.map((plan) => ({
    restaurantId: plan.restaurantId,
    category: plan.category,
    changes: plan.changes.map((change) => ({ path: change.path, encoding: change.encoding })),
  }));
  if (options.out) {
    await mkdir(options.out, { recursive: true });
    for (const [index, plan] of plans.entries()) {
      await writeFile(join(options.out, `${plan.restaurantId}.json`), `${JSON.stringify(plan, null, 2)}\n`);
      process.stdout.write(`${plan.restaurantId}: ${plan.changes.length} 项变更\n`);
      if (index === plans.length - 1) process.stdout.write(`计划已写入 ${resolve(options.out)}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function parseArgs(argv) {
  const options = { records: null, 'data-dir': null, site: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--help' || name === '-h') {
      process.stdout.write(`${usage}\n`);
      process.exit(0);
    }
    if (!['--records', '--data-dir', '--site', '--out'].includes(name)) throw new Error(`未知参数：${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} 需要提供取值。`);
    options[name.slice(2).replace(/-(\w)/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  if (options.records && options.dataDir) throw new Error('--records 与 --data-dir 只能选一个。');
  if ((!options.records && !options.dataDir) || !options.site) throw new Error(`${usage}`);
  return options;
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
