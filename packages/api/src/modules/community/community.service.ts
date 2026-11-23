import { ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LearningPathEntity } from '../learning-paths/entities/learning-path.entity.js';
import { SearchIndexService } from '../search/search-index.service.js';
import type { CommunityCategory, CommunityPath, CommunityPathDetail, ListCommunityPathsDto } from './dto.js';
import { PUBLIC_PATH } from './public-path.js';

export { PUBLIC_PATH };

const notFound = () =>
  new NotFoundException({ statusCode: 404, code: 'COURSE_NOT_FOUND', message: 'Course not found.' });

/**
 * Columns of a `CommunityPath` row (alias `p`); `$1` is the caller, for `copied_path_id`: their copy, or the path
 * itself when it is their own visible one (they open it rather than copy it).
 */
const COLUMNS = `p.id, p.title, p.summary, p.category_id, c.name AS category_name, p.tags,
  p.preferences->>'level' AS level,
  (SELECT count(*)::int FROM path_modules m WHERE m.path_id = p.id) AS module_count,
  (SELECT count(*)::int FROM path_lessons l JOIN path_modules m ON m.id = l.module_id WHERE m.path_id = p.id)
    AS lesson_count,
  (SELECT count(*)::int FROM learning_paths cp WHERE cp.source_path_id = p.id) AS copies,
  CASE WHEN p.user_id = $1 AND p.hidden_at IS NULL THEN p.id
    ELSE (SELECT cp.id FROM learning_paths cp WHERE cp.source_path_id = p.id AND cp.user_id = $1 LIMIT 1)
  END AS copied_path_id,
  (SELECT r.thumbnail_url FROM path_modules m JOIN path_lessons l ON l.module_id = m.id
     JOIN lesson_resources r ON r.content_id = l.content_id
   WHERE m.path_id = p.id ORDER BY m.position, l.position, r.position LIMIT 1) AS thumbnail_url`;
const FROM = 'FROM learning_paths p LEFT JOIN categories c ON c.id = p.category_id';
/** The caller's own visible paths are not "community" to them; their hidden originals are. */
const NOT_OWN_VISIBLE = 'NOT (p.user_id = $1 AND p.hidden_at IS NULL)';
// Typesense's per_page maximum.
const MAX_PAGE = 250;

type Row = {
  id: string;
  title: string;
  summary: string;
  category_id: string | null;
  category_name: string | null;
  tags: string[];
  level: CommunityPath['level'];
  module_count: number;
  lesson_count: number;
  copies: number;
  copied_path_id: string | null;
  thumbnail_url: string | null;
};

const toPath = (r: Row): CommunityPath => ({
  id: r.id,
  title: r.title,
  summary: r.summary,
  category: r.category_id ? { id: r.category_id, name: r.category_name! } : null,
  tags: r.tags,
  level: r.level,
  moduleCount: r.module_count,
  lessonCount: r.lesson_count,
  copies: r.copies,
  copiedPathId: r.copied_path_id,
  thumbnailUrl: r.thumbnail_url,
});

@Injectable()
export class CommunityService {
  private readonly log = new Logger(CommunityService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly search: SearchIndexService,
  ) {}

  /**
   * Gives the caller their own active path on a public course: lessons share the original's content rows, progress
   * starts empty, the author's goal is dropped. Idempotent; the owner of a hidden original gets it back instead.
   */
  async copy(userId: string, pathId: string): Promise<{ id: string; created: boolean }> {
    const result = await this.ds.transaction(async (m) => {
      // Serialises one user's copies, so a double tap cannot make two.
      await m.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`path_copy:${userId}`]);
      const [src] = await m.query(`SELECT * FROM learning_paths p WHERE p.id = $1 AND ${PUBLIC_PATH}`, [pathId]);
      if (!src) throw notFound();
      if (src.user_id === userId) {
        if (!src.hidden_at) throw notFound();
        await m.update(LearningPathEntity, pathId, { hiddenAt: null });
        return { id: pathId, created: false };
      }
      const [existing] = await m.query(`SELECT id FROM learning_paths WHERE user_id = $1 AND source_path_id = $2`, [
        userId,
        pathId,
      ]);
      if (existing) return { id: existing.id as string, created: false };
      // A learner never has two lessons on one content row.
      const [taken] = await m.query(
        `SELECT pm.path_id FROM path_lessons l JOIN path_modules pm ON pm.id = l.module_id
         JOIN learning_paths p ON p.id = pm.path_id
         WHERE p.user_id = $1 AND p.hidden_at IS NULL AND l.content_id IN
           (SELECT sl.content_id FROM path_lessons sl JOIN path_modules sm ON sm.id = sl.module_id WHERE sm.path_id = $2)
         LIMIT 1`,
        [userId, pathId],
      );
      if (taken)
        throw new ConflictException({
          statusCode: 409,
          code: 'ALREADY_LEARNING',
          message: 'You are already learning this course.',
          pathId: taken.path_id,
        });
      const copy = await m.save(
        m.create(LearningPathEntity, {
          userId,
          status: 'active',
          sourcePathId: pathId,
          title: src.title,
          summary: src.summary,
          categoryId: src.category_id,
          tags: src.tags,
          contentLanguage: src.content_language,
          preferences: { topic: src.preferences.topic, level: src.preferences.level },
        }),
      );
      await m.query(
        `WITH mods AS (
           INSERT INTO path_modules (path_id, position, title)
           SELECT $1, position, title FROM path_modules WHERE path_id = $2 RETURNING id, position)
         INSERT INTO path_lessons (module_id, position, title, content_id)
         SELECT mods.id, l.position, l.title, l.content_id
         FROM path_modules sm JOIN mods ON mods.position = sm.position JOIN path_lessons l ON l.module_id = sm.id
         WHERE sm.path_id = $2`,
        [copy.id, pathId],
      );
      return { id: copy.id, created: true };
    });
    // The source's `copies` changed.
    if (result.created) await this.search.publish(pathId);
    return result;
  }

  /** Typesense finds and orders the ids; Postgres, the truth, fills them in and drops stale or own visible ones. */
  async list(userId: string, q: ListCommunityPathsDto): Promise<CommunityPath[]> {
    const [{ n }] = await this.ds.query(
      `SELECT count(*)::int AS n FROM learning_paths p WHERE p.user_id = $1 AND p.hidden_at IS NULL AND ${PUBLIC_PATH}`,
      [userId],
    );
    // shortcut: a caller with over 200 own public paths may get a short page; upgrade to a Typesense id filter then.
    const { ids } = await this.searching(() =>
      this.search.search({ q: q.q, categoryId: q.category, tag: q.tag, limit: Math.min(q.limit + n, MAX_PAGE) }),
    );
    if (!ids.length) return [];
    const rows: Row[] = await this.ds.query(
      `SELECT ${COLUMNS} ${FROM}
       WHERE p.id = ANY($2::uuid[]) AND ${PUBLIC_PATH} AND ${NOT_OWN_VISIBLE}
       ORDER BY array_position($2::uuid[], p.id) LIMIT $3`,
      [userId, ids, q.limit],
    );
    return rows.map(toPath);
  }

  async detail(userId: string, pathId: string): Promise<CommunityPathDetail> {
    const [row]: Row[] = await this.ds.query(`SELECT ${COLUMNS} ${FROM} WHERE p.id = $2 AND ${PUBLIC_PATH}`, [
      userId,
      pathId,
    ]);
    if (!row) throw notFound();
    const modules: { title: string; lessons: { title: string }[] }[] = await this.ds.query(
      `SELECT m.title, coalesce(
         (SELECT json_agg(json_build_object('title', l.title) ORDER BY l.position)
          FROM path_lessons l WHERE l.module_id = m.id), '[]') AS lessons
       FROM path_modules m WHERE m.path_id = $1 ORDER BY m.position`,
      [pathId],
    );
    return { ...toPath(row), modules };
  }

  async categories(): Promise<CommunityCategory[]> {
    const facets = await this.searching(() => this.search.categoryFacets());
    if (!facets.length) return [];
    const rows: { id: string; name: string }[] = await this.ds.query(
      `SELECT id, name FROM categories WHERE id = ANY($1::uuid[])`,
      [facets.map((f) => f.id)],
    );
    const names = new Map(rows.map((r) => [r.id, r.name]));
    return facets
      .filter((f) => names.has(f.id))
      .map((f) => ({ id: f.id, name: names.get(f.id)!, count: f.count }))
      .sort((x, y) => y.count - x.count);
  }

  /** Public paths of others not copied yet: the caller's categories first (by how many of their paths), then copies. */
  async recommendations(userId: string, limit: number): Promise<CommunityPath[]> {
    const rows: Row[] = await this.ds.query(
      `SELECT ${COLUMNS} ${FROM}
       WHERE ${PUBLIC_PATH} AND p.user_id <> $1
         AND NOT EXISTS (SELECT 1 FROM learning_paths cp WHERE cp.source_path_id = p.id AND cp.user_id = $1)
       ORDER BY (SELECT count(*) FROM learning_paths o WHERE o.user_id = $1 AND o.status = 'active'
                   AND o.hidden_at IS NULL AND o.category_id = p.category_id) DESC,
         copies DESC, p.created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.map(toPath);
  }

  /** No Postgres fallback: the app shows a Retry. */
  private async searching<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      this.log.error(`search failed: ${String(e)}`);
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: 'SEARCH_UNAVAILABLE',
        message: 'Search is unavailable. Try again shortly.',
      });
    }
  }
}
