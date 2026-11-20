import { describe, expect, it } from 'vitest';
import { LearningPathsService } from './learning-paths.service.js';
import { StubPathAi } from './stub-path-ai.js';

describe('LearningPathsService.start', () => {
  it('applies review edits to a draft, and ignores edits once active', async () => {
    const svc = new LearningPathsService(new StubPathAi());
    const draft = await svc.generate('u1', { topic: 'SQL', level: 'beginner' });
    const edited = [{ title: 'Chỉ một chương', lessons: [{ title: 'Một bài' }] }];

    expect(svc.start('u1', draft.id, edited).modules).toEqual(edited);
    expect(svc.start('u1', draft.id, []).modules).toEqual(edited);
  });
});
