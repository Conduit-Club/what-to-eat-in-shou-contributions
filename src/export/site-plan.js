import { HttpError, invariant } from '../errors.js';
import { publicSnapshot } from '../domain/publication.js';
import { validatePublication } from '../domain/publication.js';

const categoryLabels = { 'on-campus': '校内', 'off-campus': '校外' };

export function createNewRestaurantPlan({ record, image, site }) {
  invariant(record.status === 'approved' && record.publicFields, 409, 'not_exportable', '只有已批准且包含公开字段的投稿可以导出。');
  const publication = record.publicFields;
  validatePublication(publication, publication);
  const extension = imageExtension(record.imageKey);
  const snapshot = publicSnapshot(publication, extension);
  const restaurants = parseRestaurants(site.restaurantsJson);
  invariant(!restaurants.some((restaurant) => restaurant.id === snapshot.id), 409, 'restaurant_exists', '该餐厅 ID 已存在，应使用已有餐厅导出流程。');
  const category = snapshot.category;
  const markdownPath = `website/docs/${category}/${snapshot.id}.md`;
  invariant(site.existingPaths?.includes(markdownPath) !== true, 409, 'restaurant_exists', '目标详情页已存在。');
  const nextRestaurants = [...restaurants, snapshot].sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const changes = [
    textChange('website/src/data/restaurants.json', `${JSON.stringify(nextRestaurants, null, 2)}\n`),
    textChange(markdownPath, restaurantMarkdown(snapshot)),
    textChange(`website/docs/${category}/index.md`, appendIndexEntry(site.categoryIndex, snapshot)),
    textChange('website/sidebars.ts', appendSidebarEntry(site.sidebars, category, snapshot.id)),
  ];
  if (publication.imageApproved) {
    invariant(image?.buffer instanceof Buffer && image.buffer.length > 0, 422, 'missing_public_image', '已批准公开图片，但没有可导出的图片。');
    changes.push(binaryChange(`website/static/img/${snapshot.id}.${extension}`, image.buffer));
  }
  return { restaurantId: snapshot.id, category, changes };
}

function parseRestaurants(contents) {
  try {
    const restaurants = JSON.parse(contents);
    invariant(Array.isArray(restaurants), 422, 'invalid_site_snapshot', 'restaurants.json 必须是数组。');
    return restaurants;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'invalid_site_snapshot', 'restaurants.json 不是有效 JSON。');
  }
}

function imageExtension(key) {
  const match = /\.(jpg|png|webp)$/.exec(key || '');
  if (!match) throw new HttpError(422, 'invalid_image_key', '私有图片存储键没有受支持的扩展名。');
  return match[1];
}

function restaurantMarkdown(snapshot) {
  return `# ${escapeMarkdown(snapshot.name)}

## 位置

${escapeMarkdown(snapshot.location)}

## 消费范围

${escapeMarkdown(snapshot.price)}

## 注意事项

${snapshot.openingHours ? escapeMarkdown(snapshot.openingHours) : '待补充。'}

## 同学评价

> ${escapeQuote(snapshot.taste)}
>
> —— 匿名投稿
`;
}

function appendIndexEntry(index, snapshot) {
  invariant(typeof index === 'string' && index.length > 0, 422, 'invalid_site_index', '分类索引不存在或为空。');
  return `${index.trimEnd()}\n\n- [${escapeMarkdown(snapshot.name)}](${snapshot.id}.md)\n`;
}

function appendSidebarEntry(sidebars, category, id) {
  invariant(typeof sidebars === 'string' && sidebars.length > 0, 422, 'invalid_site_sidebars', 'sidebars.ts 不存在或为空。');
  const categoryStart = sidebars.indexOf(`label: '${categoryLabels[category]}'`);
  invariant(categoryStart >= 0, 422, 'invalid_site_sidebars', 'sidebars.ts 中找不到目标分类。');
  const itemsStart = sidebars.indexOf('items:', categoryStart);
  invariant(itemsStart >= 0, 422, 'invalid_site_sidebars', '目标分类缺少 items。');
  const listStart = sidebars.indexOf('[', itemsStart);
  invariant(listStart >= 0, 422, 'invalid_site_sidebars', 'sidebars.ts 中找不到目标分类项目列表。');
  let depth = 0;
  for (let index = listStart; index < sidebars.length; index += 1) {
    if (sidebars[index] === '[') depth += 1;
    if (sidebars[index] === ']') {
      depth -= 1;
      if (depth === 0) {
        const contents = sidebars.slice(listStart + 1, index).trim();
        invariant(/^(?:\s*'[-a-z0-9/]+'\s*,)*\s*(?:'[-a-z0-9/]+'\s*)?$/.test(contents), 422, 'invalid_site_sidebars', '仅支持静态文档 ID 列表。');
        const indentation = sidebars.slice(sidebars.lastIndexOf('\n', index - 1) + 1, index).match(/^\s*/)[0];
        return `${sidebars.slice(0, index).trimEnd()}${!contents || contents.endsWith(',') ? '' : ','}\n${indentation}  '${category}/${id}',\n${indentation}${sidebars.slice(index)}`;
      }
    }
  }
  throw new HttpError(422, 'invalid_site_sidebars', 'sidebars.ts 中的分类项目列表未闭合。');
}

function escapeMarkdown(value) {
  return Array.from(String(value), (character) => /[a-zA-Z0-9\u0080-\uFFFF]/u.test(character) ? character : `&#${character.codePointAt(0)};`).join('');
}

function escapeQuote(value) {
  return escapeMarkdown(value).replace(/\n/g, '\n> ');
}

function textChange(path, content) { return { path, encoding: 'utf8', content }; }
function binaryChange(path, content) { return { path, encoding: 'base64', content: content.toString('base64') }; }
