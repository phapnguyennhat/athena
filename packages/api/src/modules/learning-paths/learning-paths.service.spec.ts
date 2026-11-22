import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LearningPathEntity } from './entities/learning-path.entity.js';
import { PathConversation } from './entities/path-conversation.entity.js';
import { PathLesson } from './entities/path-lesson.entity.js';
import { LessonContentEntity } from '../lessons/entities/lesson-content.entity.js';
import { PathModule } from './entities/path-module.entity.js';
import { LearningPathsService } from './learning-paths.service.js';

const stored = {
  id: 'p1',
  userId: 'u1',
  conversationId: 'c1',
  status: 'draft',
  title: 'SQL',
  summary: 'Tóm tắt',
  category: { id: 'cat1', slug: 'lap-trinh', name: 'Lập trình' },
  tags: ['sql'],
  modules: [
    {
      id: 'm2',
      position: 1,
      title: 'Hai',
      lessons: [{ id: 'l3', position: 0, title: 'Ba' }],
    },
    {
      id: 'm1',
      position: 0,
      title: 'Một',
      lessons: [
        { id: 'l2', position: 1, title: 'Hai' },
        { id: 'l1', position: 0, title: 'Một' },
      ],
    },
  ],
};

function setup(path: Partial<LearningPathEntity> | null) {
  const m = {
    findOneBy: vi.fn().mockResolvedValue(path),
    findOne: vi.fn().mockResolvedValue(path),
    delete: vi.fn(),
    query: vi.fn().mockResolvedValue([{ content_id: 'old-c0' }]),
    update: vi.fn(),
    save: vi.fn((_e: unknown, rows: object[]) => Promise.resolve(rows.map((r, i) => ({ ...r, id: `new-m${i}` })))),
    insert: vi.fn((_e: unknown, rows: object[]) =>
      Promise.resolve({ identifiers: rows.map((_, i) => ({ id: `c${i}` })) }),
    ),
  };
  const ds = {
    transaction: vi.fn((fn: (mgr: typeof m) => unknown) => fn(m)),
    query: vi.fn().mockResolvedValue([{ lesson_id: 'l2', status: 'completed' }]),
  };
  const repo = { findOne: vi.fn().mockResolvedValue(stored) };
  return { m, repo, svc: new LearningPathsService(ds as never, repo as never, { publish: vi.fn() } as never) };
}

describe('LearningPathsService', () => {
  it('get returns the app view with modules and lessons ordered by position, with per-lesson status', async () => {
    const { svc } = setup(null);
    expect(await svc.get('u1', 'p1')).toEqual({
      id: 'p1',
      status: 'draft',
      title: 'SQL',
      summary: 'Tóm tắt',
      category: { id: 'cat1', name: 'Lập trình' },
      tags: ['sql'],
      progress: { done: 1, total: 3 },
      modules: [
        {
          id: 'm1',
          title: 'Một',
          lessons: [
            { id: 'l1', title: 'Một', status: 'not_started' },
            { id: 'l2', title: 'Hai', status: 'completed' },
          ],
        },
        { id: 'm2', title: 'Hai', lessons: [{ id: 'l3', title: 'Ba', status: 'not_started' }] },
      ],
    });
  });

  it('get 404s for a path the user does not own', async () => {
    const { svc, repo } = setup(null);
    repo.findOne.mockResolvedValue(null);
    await expect(svc.get('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('start applies review edits to a draft, activates it and closes the conversation', async () => {
    const { svc, m } = setup({
      id: 'p1',
      userId: 'u1',
      conversationId: 'c1',
      status: 'draft',
    });
    const edited = [{ title: 'Chỉ một chương', lessons: [{ title: 'Một bài' }] }];
    await svc.start('u1', 'p1', edited);
    expect(m.delete).toHaveBeenCalledWith(PathModule, { pathId: 'p1' });
    // The replaced lessons' content goes with them unless another lesson still points at it.
    expect(m.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM lesson_contents'), [['old-c0']]);
    expect(m.save).toHaveBeenCalledWith(PathModule, [{ pathId: 'p1', position: 0, title: 'Chỉ một chương' }]);
    expect(m.insert).toHaveBeenCalledWith(LessonContentEntity, [{}]);
    expect(m.insert).toHaveBeenCalledWith(PathLesson, [
      { moduleId: 'new-m0', position: 0, title: 'Một bài', contentId: 'c0' },
    ]);
    expect(m.update).toHaveBeenCalledWith(LearningPathEntity, 'p1', {
      status: 'active',
    });
    expect(m.update).toHaveBeenCalledWith(PathConversation, 'c1', {
      status: 'closed',
    });
    // Conversation is locked before the path (same order as the generate handler).
    expect(m.findOne.mock.calls.map(([e]) => e)).toEqual([PathConversation, LearningPathEntity]);
  });

  it('start ignores edits once the path is active', async () => {
    const { svc, m } = setup({
      id: 'p1',
      userId: 'u1',
      conversationId: null,
      status: 'active',
    });
    await svc.start('u1', 'p1', [{ title: 'x', lessons: [{ title: 'y' }] }]);
    expect(m.delete).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });

  it('start 404s for a path the user does not own', async () => {
    const { svc, m } = setup(null);
    await expect(svc.start('u2', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    expect(m.update).not.toHaveBeenCalled();
  });
});
