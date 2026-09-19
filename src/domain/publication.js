import { HttpError, invariant } from '../errors.js';

const limits = { id: 100, name: 100, location: 300, taste: 2000, openingHours: 200, price: 1000 };
const hasValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const text = (value, field, { nullable = false, defaultValue } = {}) => {
  if (value === undefined && defaultValue !== undefined) return defaultValue;
  if (nullable && value === null) return null;
  invariant(typeof value === 'string' && value.trim(), 422, 'invalid_public_fields', `${field} 无效。`);
  invariant(Array.from(value).length <= limits[field], 422, 'invalid_public_fields', `${field} 超过最大长度。`);
  return value.trim();
};

export function validatePublication(raw, metadata) {
  invariant(raw && typeof raw === 'object' && !Array.isArray(raw), 422, 'invalid_public_fields', '批准投稿时必须提供公开字段。');
  const id = text(raw.id, 'id');
  invariant(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id), 422, 'invalid_public_fields', 'id 必须为小写英文或数字连字符标识。');
  const category = raw.category ?? metadata.category;
  invariant(category === metadata.category, 422, 'invalid_public_fields', '公开分类必须与投稿分类一致。');
  const taste = text(raw.taste, 'taste', { defaultValue: `同学反馈：${metadata.taste}` });
  invariant(taste.startsWith('同学反馈：'), 422, 'invalid_public_fields', 'taste 必须明确标注为同学反馈。');
  const updatedAt = raw.updatedAt ?? null;
  invariant(updatedAt === null || (typeof updatedAt === 'string' && hasValidDate(updatedAt)), 422, 'invalid_public_fields', 'updatedAt 必须为合法日期或 null。');
  invariant(typeof raw.imageApproved === 'boolean', 422, 'invalid_public_fields', 'imageApproved 必须明确为布尔值。');
  return {
    id,
    name: text(raw.name, 'name', { defaultValue: metadata.name }),
    category,
    location: text(raw.location, 'location', { defaultValue: metadata.location }),
    taste,
    openingHours: text(raw.openingHours, 'openingHours', { nullable: true, defaultValue: metadata.openingHours === '待补充' ? null : metadata.openingHours }),
    visitedAt: metadata.visitedAt,
    updatedAt,
    price: text(raw.price, 'price', { defaultValue: '待补充。' }),
    imageApproved: raw.imageApproved,
  };
}

export function publicSnapshot(publication, imageExtension) {
  return {
    id: publication.id,
    name: publication.name,
    category: publication.category,
    image: publication.imageApproved ? `/img/${publication.id}.${imageExtension}` : null,
    location: publication.location,
    taste: publication.taste,
    openingHours: publication.openingHours,
    visitedAt: publication.visitedAt,
    updatedAt: publication.updatedAt,
    price: publication.price,
    detailPath: `/${publication.category}/${publication.id}`,
  };
}
