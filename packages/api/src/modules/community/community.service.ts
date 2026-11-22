import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LearningPathEntity } from '../learning-paths/entities/learning-path.entity.js';
import { SearchIndexService } from '../search/search-index.service.js';
import { PUBLIC_PATH } from './public-path.js';

export { PUBLIC_PATH };

const notFound = () =>
  new NotFoundException({ statusCode: 404, code: 'COURSE_NOT_FOUND', message: 'Course not found.' });

@Injectable()
export class CommunityService {
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
}
