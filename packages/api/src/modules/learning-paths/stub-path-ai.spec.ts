import { describe, expect, it } from 'vitest';
import { StubPathAi } from './stub-path-ai.js';

describe('StubPathAi', () => {
  const ai = new StubPathAi();
  const user = (content: string) => ({ role: 'user' as const, content });

  it('fills topic, level and time, asks the goal, then is ready', async () => {
    let r = await ai.chat([user('SQL')], {});
    expect(r.preferences.topic).toBe('SQL');
    expect(r.ready).toBe(false);
    r = await ai.chat([user('Cơ bản')], r.preferences);
    expect(r.preferences.level).toBe('beginner');
    r = await ai.chat([user('30 phút')], r.preferences);
    expect(r.preferences.dailyMinutes).toBe(30);
    expect(r.ready).toBe(false); // still asking for the goal
    r = await ai.chat([user('Đi làm')], r.preferences);
    expect(r.preferences.goal).toBe('Đi làm');
    expect(r.ready).toBe(true);
    expect(r.quickReplies).toEqual([]);
  });

  it('is ready when the goal is skipped', async () => {
    const r = await ai.chat([user('Không có mục tiêu cụ thể')], { topic: 'SQL', level: 'beginner', dailyMinutes: 30 });
    expect(r.preferences.goal).toBeUndefined();
    expect(r.ready).toBe(true);
  });

  it('keeps asking for the level when the answer is not one', async () => {
    const r = await ai.chat([user('hmm')], { topic: 'SQL' });
    expect(r.preferences.level).toBeUndefined();
    expect(r.quickReplies).toContain('Cơ bản');
  });
});
