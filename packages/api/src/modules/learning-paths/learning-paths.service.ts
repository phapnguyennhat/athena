import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import type { LearningPath } from './dto/learning-path.dto.js';
import { LearningPathEntity } from './entities/learning-path.entity.js';
import { PathConversation } from './entities/path-conversation.entity.js';
import { PathLesson } from './entities/path-lesson.entity.js';
import { PathModule } from './entities/path-module.entity.js';

/** The app's `LearningPath` shape. */
export type LearningPathView = LearningPath;

const notFound = () => new NotFoundException({ statusCode: 404, code: 'PATH_NOT_FOUND', message: 'Learning path not found.' });
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/** Inserts modules and their lessons for a path, positions following array order. */
export async function insertModules(m: EntityManager, pathId: string, modules: LearningPath['modules']): Promise<void> {
  const saved = await m.save(
    PathModule,
    modules.map((mod, i) => ({ pathId, position: i, title: mod.title })),
  );
  const lessons = saved.flatMap((s, i) => modules[i].lessons.map((l, j) => ({ moduleId: s.id, position: j, title: l.title })));
  if (lessons.length) await m.insert(PathLesson, lessons);
}

@Injectable()
export class LearningPathsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(LearningPathEntity) private readonly paths: Repository<LearningPathEntity>,
  ) {}

  async get(userId: string, id: string): Promise<LearningPathView> {
    const path = await this.paths.findOne({ where: { id, userId }, relations: { modules: { lessons: true } } });
    if (!path) throw notFound();
    return {
      id: path.id,
      status: path.status,
      title: path.title,
      summary: path.summary,
      modules: [...path.modules].sort(byPosition).map((mod) => ({
        title: mod.title,
        lessons: [...mod.lessons].sort(byPosition).map((l) => ({ title: l.title })),
      })),
    };
  }

  /** Accepts the reviewed draft: applies edits (draft only), activates it and closes its conversation. */
  async start(userId: string, id: string, modules?: LearningPath['modules']): Promise<LearningPathView> {
    await this.ds.transaction(async (m) => {
      // Lock order everywhere: conversation, then its paths (the generate handler and start-over do the same).
      const pre = await m.findOneBy(LearningPathEntity, { id, userId });
      if (!pre) throw notFound();
      if (pre.conversationId)
        await m.findOne(PathConversation, { where: { id: pre.conversationId }, lock: { mode: 'pessimistic_write' } });
      // Re-read under lock: a regenerate may have replaced this draft meanwhile.
      const path = await m.findOne(LearningPathEntity, { where: { id, userId }, lock: { mode: 'pessimistic_write' } });
      if (!path) throw notFound();
      // Review edits only apply to a draft; an active path keeps its structure.
      if (modules && path.status === 'draft') {
        await m.delete(PathModule, { pathId: id });
        await insertModules(m, id, modules);
      }
      await m.update(LearningPathEntity, id, { status: 'active' });
      if (path.conversationId) await m.update(PathConversation, path.conversationId, { status: 'closed' });
    });
    return this.get(userId, id);
  }
}
