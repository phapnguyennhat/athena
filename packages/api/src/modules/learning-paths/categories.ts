import type { DataSource, EntityManager } from 'typeorm';
import { SEED } from '../../database/migrations/1763800000000-AddCategories.js';

export const FALLBACK_CATEGORY = 'Khác';

/** Match key for category names: "Lập  Trình" and "lap trinh" are the same category. */
export const slugify = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Names offered to the model: seeded ones and ones an active path uses, minus "Khác" (only a code fallback: offered,
 * the model picks it instead of creating a fitting category). Rows the model created only for drafts
 * (maybe discarded, maybe junk from a user's topic) are not shown to other users' prompts.
 */
export async function categoryNames(m: EntityManager | DataSource): Promise<string[]> {
  const rows: { name: string }[] = await m.query(
    `SELECT c.name FROM categories c
     WHERE c.slug <> 'khac' AND (c.slug = ANY($1)
        OR EXISTS (SELECT 1 FROM learning_paths p WHERE p.category_id = c.id AND p.status = 'active'))
     ORDER BY c.name LIMIT 200`,
    [SEED.map((s) => s[0])],
  );
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
