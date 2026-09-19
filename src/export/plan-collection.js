import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createNewRestaurantPlan } from './site-plan.js';

export const snapshotPath = 'website/src/data/restaurants.json';
export const sidebarsPath = 'website/sidebars.ts';
export const categories = ['on-campus', 'off-campus'];

/**
 * Read the site repository files a plan needs. Read-only: callers must supply
 * inputs from a single site revision.
 */
export async function readSiteContext(root) {
  const restaurantsJson = await readFile(join(root, snapshotPath), 'utf8');
  const sidebars = await readFile(join(root, sidebarsPath), 'utf8');
  const categoryIndexes = {};
  for (const category of categories) {
    categoryIndexes[category] = await readFile(join(root, `website/docs/${category}/index.md`), 'utf8');
  }
  return { restaurantsJson, sidebars, categoryIndexes, existingPaths: await listDocumentPaths(root) };
}

async function listDocumentPaths(root) {
  const base = join(root, 'website/docs');
  const paths = [];
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of await readdir(join(base, entry.name))) {
      if (file.endsWith('.md')) paths.push(`website/docs/${entry.name}/${file}`);
    }
  }
  return paths.sort();
}

/**
 * Build one plan per approved record, feeding each plan's output into the next
 * so that the same category index and sidebar are not written from stale input.
 */
export function createPlansFromRecords({ records, site }) {
  let state = { ...site, categoryIndexes: { ...site.categoryIndexes }, existingPaths: [...site.existingPaths] };
  const plans = [];
  for (const record of records) {
    const category = record.publicFields?.category;
    const plan = createNewRestaurantPlan({
      record,
      image: record.image,
      site: {
        restaurantsJson: state.restaurantsJson,
        sidebars: state.sidebars,
        categoryIndex: state.categoryIndexes[category],
        existingPaths: state.existingPaths,
      },
    });
    plans.push(plan);
    state = applyPlan(state, plan);
  }
  return plans;
}

function applyPlan(site, plan) {
  const next = { ...site, categoryIndexes: { ...site.categoryIndexes }, existingPaths: [...site.existingPaths] };
  for (const change of plan.changes) {
    if (change.encoding !== 'utf8') continue;
    if (change.path === snapshotPath) next.restaurantsJson = change.content;
    else if (change.path === sidebarsPath) next.sidebars = change.content;
    else if (change.path.startsWith('website/docs/') && change.path.endsWith('/index.md')) {
      next.categoryIndexes[change.path.split('/')[2]] = change.content;
    } else if (change.path.startsWith('website/docs/')) next.existingPaths.push(change.path);
  }
  return next;
}

/**
 * 第二个出口：直接读贡献服务数据目录里已批准的记录。
 * 服务的记录形状是 { id, metadata, imageKey, status, publicFields }，这里补上导出需要的图片字节，
 * 与 GitHub 渠道的审核记录集合汇成同一个 records 数组，后续计划生成完全共用。
 */
export async function readApprovedRecords(dataDir) {
  const directory = join(dataDir, 'records');
  const records = [];
  for (const file of (await readdir(directory).catch(() => [])).filter((name) => name.endsWith('.json')).sort()) {
    const record = JSON.parse(await readFile(join(directory, file), 'utf8'));
    if (record.status !== 'approved') continue;
    const image = record.publicFields?.imageApproved && record.imageKey ? { buffer: await readFile(join(dataDir, record.imageKey)) } : null;
    records.push({ ...record, image });
  }
  return records;
}

/** Validate the reviewed-records envelope; per-record fields are checked by site-plan. */
export function parseReviewedRecords(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('审核记录文件必须是 JSON 对象。');
  if (input.schemaVersion !== 1) throw new Error('审核记录文件的 schemaVersion 必须为 1。');
  if (!Array.isArray(input.records) || input.records.length === 0) throw new Error('审核记录文件必须包含非空的 records 数组。');
  return input;
}
