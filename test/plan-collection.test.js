import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createPlansFromRecords, parseReviewedRecords, readApprovedRecords, readSiteContext } from '../src/export/plan-collection.js';

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

test('reads approved records straight from the service data directory', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'shou-data-'));
  await mkdir(join(dataDir, 'records'), { recursive: true });
  await mkdir(join(dataDir, 'images'), { recursive: true });
  await writeFile(join(dataDir, 'images', 'photo.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const fields = { id: 'first-canteen', name: '一食堂', category: 'on-campus', location: '一食堂一楼', taste: '同学反馈：面条口感不错。', openingHours: null, visitedAt: '2026-09-16', updatedAt: null, price: '待补充。', imageApproved: true };
  const record = (id, status, imageApproved) => ({ id: `${'0'.repeat(8)}-0000-4000-8000-${id}`, metadata: { schemaVersion: 1 }, imageKey: 'images/photo.jpg', status, publicFields: { ...fields, imageApproved }, createdAt: '2026-09-19T13:50:21.854Z', updatedAt: '2026-09-19T13:50:21.854Z' });
  await writeFile(join(dataDir, 'records', 'approved.json'), JSON.stringify(record('000000000001', 'approved', true)));
  await writeFile(join(dataDir, 'records', 'pending.json'), JSON.stringify(record('000000000002', 'pending', true)));

  const records = await readApprovedRecords(dataDir);
  assert.equal(records.length, 1, '只读已批准的记录');
  assert.equal(records[0].publicFields.id, 'first-canteen');
  assert.equal(Buffer.from(records[0].image.buffer).toString('hex'), 'ffd8ffd9', '批准公开图片时要带上图片字节');

  const site = await createSiteFixture();
  const out = await mkdtemp(join(tmpdir(), 'shou-plan-'));
  const { stdout } = await exec(process.execPath, ['scripts/plan-export.js', '--data-dir', dataDir, '--site', site, '--out', out]);
  assert.match(stdout, /first-canteen/);
  assert.match(stdout, /website\/static\/img\/first-canteen\.jpg/);
  assert.deepEqual(JSON.parse(await readFile(join(out, 'first-canteen.json'), 'utf8')).changes.map((change) => change.path), [
    'website/src/data/restaurants.json', 'website/docs/on-campus/first-canteen.md', 'website/docs/on-campus/index.md', 'website/sidebars.ts', 'website/static/img/first-canteen.jpg',
  ]);
});

test('reports an empty service data directory without failing', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'shou-empty-'));
  const { stdout } = await exec(process.execPath, ['scripts/plan-export.js', '--data-dir', dataDir, '--site', await createSiteFixture()]);
  assert.match(stdout, /没有已批准的记录/);
});

test('refuses to mix the two channels in one run', async () => {
  await assert.rejects(exec(process.execPath, ['scripts/plan-export.js', '--records', reviewedRecordsPath, '--data-dir', '.', '--site', '.']), /只能选一个/);
});
