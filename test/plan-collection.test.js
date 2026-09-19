import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createPlansFromRecords, parseReviewedRecords, readSiteContext } from '../src/export/plan-collection.js';

const exec = promisify(execFile);
const reviewedRecordsPath = fileURLToPath(new URL('../data/reviewed/canteen-windows-2026-09.json', import.meta.url));

async function createSiteFixture() {
  const root = await mkdtemp(join(tmpdir(), 'shou-site-'));
  await mkdir(join(root, 'website/src/data'), { recursive: true });
  await mkdir(join(root, 'website/docs/on-campus'), { recursive: true });
  await mkdir(join(root, 'website/docs/off-campus'), { recursive: true });
  await writeFile(join(root, 'website/src/data/restaurants.json'), '[\n  {\n    "id": "changfen",\n    "name": "肠粉"\n  }\n]\n');
  await writeFile(join(root, 'website/sidebars.ts'), "const sidebars = { mainSidebar: [{ type: 'category', label: '校内', items: ['on-campus/index', 'on-campus/changfen'] }, { type: 'category', label: '校外', items: ['off-campus/index'] }] };\n");
  await writeFile(join(root, 'website/docs/on-campus/index.md'), '# 校内吃什么\n\n## 店家列表\n\n- [肠粉](changfen.md)：同学评价为“能吃、方便”。\n');
  await writeFile(join(root, 'website/docs/off-campus/index.md'), '# 校外吃什么\n\n## 店家列表\n');
  await writeFile(join(root, 'website/docs/on-campus/changfen.md'), '# 肠粉\n');
  return root;
}

test('reads the site files a plan needs without touching the site', async () => {
  const site = await readSiteContext(await createSiteFixture());
  assert.equal(JSON.parse(site.restaurantsJson).length, 1);
  assert.match(site.sidebars, /label: '校内'/);
  assert.match(site.categoryIndexes['off-campus'], /# 校外吃什么/);
  assert.deepEqual(site.existingPaths, ['website/docs/off-campus/index.md', 'website/docs/on-campus/changfen.md', 'website/docs/on-campus/index.md']);
});

test('turns the reviewed canteen records into cumulative site changes', async () => {
  const site = await readSiteContext(await createSiteFixture());
  const reviewed = parseReviewedRecords(JSON.parse(await readFile(reviewedRecordsPath, 'utf8')));
  const plans = createPlansFromRecords({ records: reviewed.records, site });
  assert.deepEqual(plans.map((plan) => plan.restaurantId), ['first-canteen', 'second-canteen', 'flavor-restaurant']);

  const snapshot = JSON.parse(plans.at(-1).changes.find((change) => change.path === 'website/src/data/restaurants.json').content);
  assert.deepEqual(snapshot.map((restaurant) => restaurant.id).sort(), ['changfen', 'first-canteen', 'flavor-restaurant', 'second-canteen']);
  assert.equal(snapshot.find((restaurant) => restaurant.id === 'first-canteen').image, null);
  assert.equal(snapshot.find((restaurant) => restaurant.id === 'flavor-restaurant').visitedAt, null);

  const index = plans.at(-1).changes.find((change) => change.path === 'website/docs/on-campus/index.md').content;
  for (const id of ['first-canteen', 'second-canteen', 'flavor-restaurant']) assert.match(index, new RegExp(`\\(${id}\\.md\\)`));

  const sidebars = plans.at(-1).changes.find((change) => change.path === 'website/sidebars.ts').content;
  for (const id of ['first-canteen', 'second-canteen', 'flavor-restaurant']) assert.match(sidebars, new RegExp(`'on-campus/${id}'`));
  assert.match(sidebars, /'on-campus\/changfen'/);

  const detail = plans[0].changes.find((change) => change.path === 'website/docs/on-campus/first-canteen.md').content;
  assert.match(detail, /^# 一食堂/);
  assert.match(detail, /同学评价/);
});

test('refuses to export a restaurant that the site already has', async () => {
  const site = await readSiteContext(await createSiteFixture());
  const reviewed = parseReviewedRecords(JSON.parse(await readFile(reviewedRecordsPath, 'utf8')));
  const records = [reviewed.records[0], { ...reviewed.records[1], publicFields: { ...reviewed.records[1].publicFields, id: 'first-canteen' } }];
  assert.throws(() => createPlansFromRecords({ records, site }), { code: 'restaurant_exists' });
});

test('rejects malformed reviewed-records envelopes', () => {
  assert.throws(() => parseReviewedRecords(null), /JSON 对象/);
  assert.throws(() => parseReviewedRecords({ schemaVersion: 2, records: [{}] }), /schemaVersion/);
  assert.throws(() => parseReviewedRecords({ schemaVersion: 1, records: [] }), /records/);
});

test('writes one plan file per record and reports the change list', async () => {
  const site = await createSiteFixture();
  const out = await mkdtemp(join(tmpdir(), 'shou-plan-'));
  const { stdout } = await exec(process.execPath, ['scripts/plan-export.js', '--records', reviewedRecordsPath, '--site', site, '--out', out]);
  assert.match(stdout, /first-canteen: 4 项变更/);
  const plan = JSON.parse(await readFile(join(out, 'flavor-restaurant.json'), 'utf8'));
  assert.equal(plan.category, 'on-campus');
  assert.deepEqual(plan.changes.map((change) => change.path), [
    'website/src/data/restaurants.json',
    'website/docs/on-campus/flavor-restaurant.md',
    'website/docs/on-campus/index.md',
    'website/sidebars.ts',
  ]);
});

test('fails with a readable error when arguments are missing', async () => {
  await assert.rejects(exec(process.execPath, ['scripts/plan-export.js', '--site', '.']), /--records/);
});
