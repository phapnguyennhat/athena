import type { DataSource, EntityManager } from 'typeorm';

export const FALLBACK_CATEGORY = 'Khác';

/** Match key for category names: "Lập  Trình" and "lap trinh" are the same category. */
export const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export async function categoryNames(m: EntityManager | DataSource): Promise<string[]> {
  const rows: { name: string }[] = await m.query(`SELECT name FROM categories ORDER BY name`);
  return rows.map((r) => r.name);
}

/** Id of the category with this name's slug, created when new. Safe under concurrent creators. */
export async function resolveCategory(m: EntityManager, name: string): Promise<string> {
  let slug = slugify(name);
  if (!slug) [slug, name] = ['khac', FALLBACK_CATEGORY];
  await m.query(`INSERT INTO categories (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`, [slug, name]);
  const [row]: { id: string }[] = await m.query(`SELECT id FROM categories WHERE slug = $1`, [slug]);
  return row.id;
}
