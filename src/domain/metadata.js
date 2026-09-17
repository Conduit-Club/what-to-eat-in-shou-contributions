import { HttpError, invariant } from '../errors.js';

const limits = { name: 100, location: 300, taste: 2000, openingHours: 200 };
const countCharacters = (value) => Array.from(value).length;
const isDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export function validateMetadata(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { throw new HttpError(400, 'invalid_metadata_json', 'metadata 必须是 JSON。'); }
  invariant(data && typeof data === 'object' && !Array.isArray(data), 422, 'invalid_metadata', 'metadata 必须是对象。');
  invariant(data.schemaVersion === 1, 422, 'unsupported_schema_version', 'schemaVersion 必须为 1。');
  for (const [field, limit] of Object.entries(limits)) {
    invariant(typeof data[field] === 'string' && data[field].trim(), 422, 'invalid_metadata', `${field} 为必填项。`);
    invariant(countCharacters(data[field]) <= limit, 422, 'invalid_metadata', `${field} 超过最大长度。`);
  }
  invariant(['on-campus', 'off-campus'].includes(data.category), 422, 'invalid_metadata', 'category 无效。');
  invariant(typeof data.visitedAt === 'string' && isDate(data.visitedAt), 422, 'invalid_metadata', 'visitedAt 必须为合法日期。');
  if (data.imageFilename !== undefined) invariant(typeof data.imageFilename === 'string' && countCharacters(data.imageFilename) <= 255, 422, 'invalid_metadata', 'imageFilename 无效。');
  return {
    schemaVersion: 1, name: data.name.trim(), category: data.category, location: data.location.trim(),
    taste: data.taste.trim(), openingHours: data.openingHours.trim(), visitedAt: data.visitedAt,
    imageFilename: typeof data.imageFilename === 'string' ? data.imageFilename : null,
  };
}
