import { describe, expect, it } from 'vitest';
import { validatePathOutput } from './ai-output.js';
import { StubPathAi } from './stub-path-ai.js';

describe('StubPathAi', () => {
  const ai = new StubPathAi();
  const user = (content: string) => ({ role: 'user' as const, content });

  it('fills topic, level and time, asks the goal, then is ready', async () => {
    let r = await ai.chat({ history: [user('SQL')], preferences: {} });
    expect(r.preferences.topic).toBe('SQL');
    expect(r.ready).toBe(false);
    r = await ai.chat({ history: [user('Cơ bản')], preferences: r.preferences });
    expect(r.preferences.level).toBe('beginner');
    r = await ai.chat({ history: [user('30 phút')], preferences: r.preferences });
    expect(r.preferences.dailyMinutes).toBe(30);
    expect(r.ready).toBe(false); // still asking for the goal
    r = await ai.chat({ history: [user('Đi làm')], preferences: r.preferences });
    expect(r.preferences.goal).toBe('Đi làm');
    expect(r.ready).toBe(true);
    expect(r.quickReplies).toEqual([]);
  });

  it('is ready when the goal is skipped', async () => {
    const r = await ai.chat({ history: [user('Không có mục tiêu cụ thể')], preferences: { topic: 'SQL', level: 'beginner', dailyMinutes: 30 } });
    expect(r.preferences.goal).toBeUndefined();
    expect(r.ready).toBe(true);
  });

  it('keeps asking for the level when the answer is not one', async () => {
    const r = await ai.chat({ history: [user('hmm')], preferences: { topic: 'SQL' } });
    expect(r.preferences.level).toBeUndefined();
    expect(r.quickReplies).toContain('Cơ bản');
  });

  it('generates output that passes validation', async () => {
    const out = await ai.generate({ topic: 'x'.repeat(200), level: 'beginner', dailyMinutes: 15 });
    expect(() => validatePathOutput(out)).not.toThrow();
  });
});
