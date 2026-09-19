import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createNewRestaurantPlan } from '../src/export/site-plan.js';

const record = {
  status: 'approved',
  imageKey: 'pending/932d3f7f-5de4-4e4b-a9e2-406c274cc9d4.webp',
  publicFields: {
    id: 'first-canteen', name: '一食堂', category: 'on-campus', location: '一食堂一楼',
    taste: '同学反馈：{不要执行} <script>', openingHours: null, visitedAt: '2026-09-16',
    updatedAt: null, price: '待补充。', imageApproved: true,
  },
};
const site = {
  restaurantsJson: '[\n  {"id":"changfen","name":"肠粉"}\n]\n',
  categoryIndex: '# 校内吃什么\n\n## 店家列表\n',
  sidebars: "const sidebars = { mainSidebar: [{ type: 'category', label: '校内', items: ['on-campus/index', 'on-campus/changfen'] }, { type: 'category', label: '校外', items: ['off-campus/index'] }] };\n",
  existingPaths: ['website/docs/on-campus/changfen.md'],
};

test('creates one complete new-restaurant change set with only approved public image data', () => {
  const plan = createNewRestaurantPlan({ record, image: { buffer: Buffer.from('image-data') }, site });
  assert.equal(plan.restaurantId, 'first-canteen');
  assert.deepEqual(plan.changes.map((change) => change.path), ['website/src/data/restaurants.json', 'website/docs/on-campus/first-canteen.md', 'website/docs/on-campus/index.md', 'website/sidebars.ts', 'website/static/img/first-canteen.webp']);
  const snapshot = JSON.parse(plan.changes[0].content).find((item) => item.id === 'first-canteen');
  assert.equal(snapshot.image, '/img/first-canteen.webp');
  assert.equal(snapshot.updatedAt, null);
  assert.ok(plan.changes[1].content.includes('&#123;不要执行&#125;&#32;&#60;script&#62;'));
  assert.match(plan.changes[3].content, /'on-campus\/first-canteen'/);
});

test('does not export an image that lacks explicit publication permission', () => {
  const plan = createNewRestaurantPlan({ record: { ...record, publicFields: { ...record.publicFields, imageApproved: false } }, site });
  assert.equal(plan.changes.some((change) => change.path.startsWith('website/static/img/')), false);
  assert.equal(JSON.parse(plan.changes[0].content).find((item) => item.id === 'first-canteen').image, null);
});

test('exports a record whose image was never stored when the image is not approved', () => {
  const unapproved = { ...record, imageKey: null, publicFields: { ...record.publicFields, imageApproved: false } };
  const plan = createNewRestaurantPlan({ record: unapproved, site });
  assert.equal(JSON.parse(plan.changes[0].content).find((item) => item.id === 'first-canteen').image, null);
  assert.throws(() => createNewRestaurantPlan({ record: { ...unapproved, publicFields: { ...unapproved.publicFields, imageApproved: true } }, site }), { code: 'invalid_image_key' });
});

test('refuses to overwrite an existing restaurant ID', () => {
  assert.throws(() => createNewRestaurantPlan({ record: { ...record, publicFields: { ...record.publicFields, id: 'changfen' } }, image: { buffer: Buffer.from('image-data') }, site }), { code: 'restaurant_exists' });
});

test('preserves a sidebar with trailing commas without producing array holes', () => {
  const source = "const sidebars = { mainSidebar: [{ label: '校内', items: ['on-campus/index',] }] };";
  const plan = createNewRestaurantPlan({ record, image: { buffer: Buffer.from('image') }, site: { ...site, sidebars: source } });
  const output = plan.changes.find((change) => change.path === 'website/sidebars.ts').content;
  const items = runInNewContext(`${output}; sidebars.mainSidebar[0].items`);
  assert.deepEqual(Array.from(items), ['on-campus/index', 'on-campus/first-canteen']);
});

test('refuses pending records and existing detail pages', () => {
  assert.throws(() => createNewRestaurantPlan({ record: { ...record, status: 'pending' }, site }), { code: 'not_exportable' });
  assert.throws(() => createNewRestaurantPlan({ record, site: { ...site, existingPaths: ['website/docs/on-campus/first-canteen.md'] } }), { code: 'restaurant_exists' });
});

test('encodes links, MDX expressions, HTML and block delimiters as text', () => {
  const hostile = '[click](javascript:alert(1))\nimport X from "x"\n```\n{process.env.SECRET}<script>';
  const plan = createNewRestaurantPlan({ record: { ...record, publicFields: { ...record.publicFields, name: hostile.slice(0, 90), taste: `同学反馈：${hostile}`, imageApproved: false } }, site });
  const markdown = plan.changes[1].content;
  assert.ok(!markdown.includes('javascript:'));
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('{process'));
  assert.ok(!markdown.includes('\nimport '));
  assert.ok(!markdown.includes('```'));
});
