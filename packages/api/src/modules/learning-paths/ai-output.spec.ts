import { describe, expect, it } from 'vitest';
import {
  AiError,
  normalizeCategorized,
  serverReady,
  validateChatOutput,
  validateExtendOutput,
  validatePathOutput,
} from './ai-output.js';

const chat = (over: Record<string, unknown> = {}) => ({
  reply: 'Xin chào',
  quickReplies: [],
  preferences: { topic: 'SQL', level: 'beginner' },
  ready: true,
  offTopic: false,
  ...over,
});
const path = (modules: unknown) => ({ title: 'T', summary: 'S', modules });
const mod = (n: number, title = 'M') => ({
  title,
  lessons: Array.from({ length: n }, () => ({ title: 'L' })),
});
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof AiError ? e.code : 'other';
  }
};

describe('serverReady', () => {
  it('is false when the model says ready but the level is missing', () => {
    const out = validateChatOutput(chat({ preferences: { topic: 'SQL' } }));
    expect(serverReady(out)).toBe(false);
  });
  it('drops a daily-minutes field the model may still send', () => {
    expect(
      validateChatOutput(chat({ preferences: { topic: 'SQL', level: 'beginner', dailyMinutes: 30 } })).preferences,
    ).toEqual({ topic: 'SQL', level: 'beginner' });
  });
  it('is true when topic and level are present', () => {
    expect(serverReady(validateChatOutput(chat()))).toBe(true);
  });
});

describe('validateChatOutput', () => {
  it('drops an invalid level and keeps the rest', () => {
    const out = validateChatOutput(chat({ preferences: { topic: 'SQL', level: 'expert' } }));
    expect(out.preferences.level).toBeUndefined();
    expect(out.preferences.topic).toBe('SQL');
  });
  it('keeps only the first 4 of 5 quick replies', () => {
    expect(validateChatOutput(chat({ quickReplies: ['a', 'b', 'c', 'd', 'e'] })).quickReplies).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
  it('drops empty, over-40-char and non-string quick replies', () => {
    expect(
      validateChatOutput(chat({ quickReplies: ['a', '', 'x'.repeat(41), 7, 'x'.repeat(40)] })).quickReplies,
    ).toEqual(['a', 'x'.repeat(40)]);
  });
  it('drops bad quick replies before taking the first 4', () => {
    expect(validateChatOutput(chat({ quickReplies: ['', 'a', 'b', 'c', 'd'] })).quickReplies).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
  it('still rejects a 601-char reply', () => {
    expect(code(() => validateChatOutput(chat({ reply: 'x'.repeat(601) })))).toBe('AI_INVALID_OUTPUT');
  });
  it('rejects quickReplies that is not an array', () => {
    expect(code(() => validateChatOutput(chat({ quickReplies: 'a' })))).toBe('AI_INVALID_OUTPUT');
  });
  it('rejects non-object output', () => {
    expect(code(() => validateChatOutput('nope'))).toBe('AI_INVALID_OUTPUT');
  });
});

describe('validatePathOutput', () => {
  it('rejects 9 modules', () => {
    expect(code(() => validatePathOutput(path(Array.from({ length: 9 }, () => mod(2)))))).toBe('AI_INVALID_OUTPUT');
  });
  it('rejects a module with 1 lesson', () => {
    expect(code(() => validatePathOutput(path([mod(2), mod(2), mod(1)])))).toBe('AI_INVALID_OUTPUT');
  });
  it('rejects a 121-char title', () => {
    expect(code(() => validatePathOutput(path([mod(2, 'x'.repeat(121)), mod(2), mod(2)])))).toBe('AI_INVALID_OUTPUT');
  });
  it('maps {rejected:true} to TOPIC_REJECTED', () => {
    expect(code(() => validatePathOutput({ rejected: true }))).toBe('TOPIC_REJECTED');
  });
  it('accepts 3 modules x 2 lessons', () => {
    expect(validatePathOutput(path([mod(2), mod(2), mod(2)])).modules).toHaveLength(3);
  });
});

describe('normalizeCategorized', () => {
  it('trims the category and cleans tags', () => {
    expect(normalizeCategorized({ category: '  Lập   trình ', tags: ['SQL', 'sql', ' ', 'Cơ Sở Dữ Liệu'] })).toEqual({
      category: 'Lập trình',
      tags: ['sql', 'cơ sở dữ liệu'],
    });
  });
  it('falls back to Khác for an unusable category', () => {
    for (const category of ['', '   ', '!!!', 42, undefined, 'x'.repeat(61)])
      expect(normalizeCategorized({ category, tags: [] }).category).toBe('Khác');
  });
  it('drops non-array tags, non-strings, over-long tags and keeps at most 5', () => {
    expect(normalizeCategorized({ category: 'A', tags: 'sql' }).tags).toEqual([]);
    expect(
      normalizeCategorized({ category: 'A', tags: ['a', 'b', 1, 'x'.repeat(41), 'c', 'd', 'e', 'f'] }).tags,
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('never throws on garbage', () => {
    expect(normalizeCategorized(null)).toEqual({ category: 'Khác', tags: [] });
  });
  it('is applied by validatePathOutput', () => {
    expect(
      validatePathOutput({ ...path([mod(2), mod(2), mod(2)]), category: 'Toán học', tags: ['đại số'] }),
    ).toMatchObject({ category: 'Toán học', tags: ['đại số'] });
    expect(validatePathOutput(path([mod(2), mod(2), mod(2)]))).toMatchObject({ category: 'Khác', tags: [] });
  });
});

describe('validateExtendOutput', () => {
  it('keeps up to 3 next modules', () => {
    expect(validateExtendOutput({ complete: false, modules: [mod(2, 'Tiếp')] })).toEqual({
      complete: false,
      modules: [{ title: 'Tiếp', lessons: [{ title: 'L' }, { title: 'L' }] }],
    });
    expect(code(() => validateExtendOutput({ complete: false, modules: [mod(2), mod(2), mod(2), mod(2)] }))).toBe(
      'AI_INVALID_OUTPUT',
    );
  });
  it('treats no new modules as complete', () => {
    expect(validateExtendOutput({ complete: false, modules: [] })).toEqual({ complete: true, modules: [] });
  });
  it('rejects a missing flag or a 1-lesson module', () => {
    expect(code(() => validateExtendOutput({ modules: [] }))).toBe('AI_INVALID_OUTPUT');
    expect(code(() => validateExtendOutput({ complete: false, modules: [mod(1)] }))).toBe('AI_INVALID_OUTPUT');
  });
});
