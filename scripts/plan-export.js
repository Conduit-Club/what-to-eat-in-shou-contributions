#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { createPlansFromRecords, parseReviewedRecords, readSiteContext } from '../src/export/plan-collection.js';
import { readApprovedRecordsFromAdapters } from '../src/export/record-source.js';
import { loadAdapters } from '../src/composition.js';

const usage = `用法：node scripts/plan-export.js (--records <审核记录.json> | --data-dir <服务数据目录> | --adapter <适配器模块>) --site <站点仓库路径> [--out <输出目录>]

两个投稿渠道共用这一个出口：
  --records    GitHub Issue 渠道或人工整理的审核记录集合
  --data-dir   内置文件适配器的数据目录，读取其中已批准的记录与对应图片
  --adapter    外部适配器模块（等价于 CONTRIB_ADAPTERS），可用 --data-dir 传入目录配置
读取审核记录与站点仓库文件，为每条记录生成站点变更计划。
该命令只读站点仓库、只写输出目录，不创建分支、不推送、不开 PR。`;

async function main(argv) {
  const options = parseArgs(argv);
  const records = options.records
    ? parseReviewedRecords(JSON.parse(await readFile(options.records, 'utf8'))).records
    : await loadServiceRecords(options);
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

async function loadServiceRecords(options) {
  const env = { ...process.env };
  if (options.adapter) env.CONTRIB_ADAPTERS = options.adapter;
  if (options.dataDir) env.DATA_DIR = options.dataDir;
  const adapters = await loadAdapters({
    env,
    dataDir: resolve(options.dataDir || env.DATA_DIR || '.data'),
    requireExport: true,
  });
  return readApprovedRecordsFromAdapters(adapters);
}

function parseArgs(argv) {
  const options = { records: null, 'data-dir': null, adapter: null, site: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name === '--help' || name === '-h') {
      process.stdout.write(`${usage}\n`);
      process.exit(0);
    }
    if (!['--records', '--data-dir', '--adapter', '--site', '--out'].includes(name)) throw new Error(`未知参数：${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} 需要提供取值。`);
    options[name.slice(2).replace(/-(\w)/g, (_, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  if (options.records && (options.dataDir || options.adapter)) throw new Error('--records 与 --data-dir/--adapter 只能选一个。');
  if (!options.site || (!options.records && !options.dataDir && !options.adapter)) throw new Error(`${usage}`);
  return options;
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
