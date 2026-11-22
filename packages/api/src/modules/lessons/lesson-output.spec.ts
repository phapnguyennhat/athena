import { describe, expect, it } from 'vitest';
import { AiError } from '../learning-paths/ai-output.js';
import { validateLessonOutput, validateQuizOutput } from './lesson-output.js';
import { parseSearch } from './youtube.service.js';
import { addDays } from './streak.service.js';

const lesson = (over: object = {}) => ({
  intro: 'Mở đầu',
  sections: [
    { heading: 'A', body: 'Nội dung A', example: 'VD' },
    { heading: 'B', body: 'Nội dung B', example: '  ' },
  ],
  takeaways: ['x', 'y'],
  keywords: ['sql join'],
  ...over,
});
const q = (over: object = {}) => ({ prompt: 'Hỏi?', options: ['a', 'b', 'c', 'd'], answer: 2, explanation: 'Vì c.', ...over });
const quiz = (questions: unknown[]) => ({ questions });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as AiError).code;
  }
};

describe('validateLessonOutput', () => {
  it('keeps valid content and drops blank examples and an empty practice', () => {
    const out = validateLessonOutput(lesson({ practice: '' }));
    expect(out.sections[1]).toEqual({ heading: 'B', body: 'Nội dung B' });
    expect(out).not.toHaveProperty('practice');
    expect(out.keywords).toEqual(['sql join']);
  });

  it('rejects fewer than 2 sections', () => {
    expect(code(() => validateLessonOutput(lesson({ sections: [{ heading: 'A', body: 'B' }] })))).toBe('AI_INVALID_OUTPUT');
  });

  it('rejects any URL in generated text (unverified resource)', () => {
    expect(code(() => validateLessonOutput(lesson({ intro: 'Xem https://example.com' })))).toBe('AI_INVALID_OUTPUT');
    expect(code(() => validateLessonOutput(lesson({ takeaways: ['www.foo.vn', 'y'] })))).toBe('AI_INVALID_OUTPUT');
  });

  it('rejects non-objects', () => {
    expect(code(() => validateLessonOutput('x'))).toBe('AI_INVALID_OUTPUT');
  });
});

describe('validateQuizOutput', () => {
  it('accepts a valid quiz and strips extra fields', () => {
    const out = validateQuizOutput(quiz([q({ extra: 1 }), q(), q()]));
    expect(out.questions[0]).toEqual({ prompt: 'Hỏi?', options: ['a', 'b', 'c', 'd'], answer: 2, explanation: 'Vì c.' });
  });

  it('rejects an answer index outside the options', () => {
    expect(code(() => validateQuizOutput(quiz([q({ answer: 4 }), q(), q()])))).toBe('AI_INVALID_OUTPUT');
    expect(code(() => validateQuizOutput(quiz([q({ answer: -1 }), q(), q()])))).toBe('AI_INVALID_OUTPUT');
  });

  it('rejects duplicate options (case and whitespace insensitive)', () => {
    expect(code(() => validateQuizOutput(quiz([q({ options: ['a', 'B', ' b ', 'd'] }), q(), q()])))).toBe('AI_INVALID_OUTPUT');
  });

  it('rejects missing options and too few questions', () => {
    expect(code(() => validateQuizOutput(quiz([q({ options: ['a', 'b'] }), q(), q()])))).toBe('AI_INVALID_OUTPUT');
    expect(code(() => validateQuizOutput(quiz([q(), q()])))).toBe('AI_INVALID_OUTPUT');
  });
});

describe('parseSearch', () => {
  const item = (videoId: unknown, title: unknown = 'T &amp; &#39;x&#39;') => ({
    id: { videoId },
    snippet: { title, channelTitle: 'Kênh', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/a/mq.jpg' } } },
  });

  it('keeps well-formed ids, unescapes titles, dedupes', () => {
    expect(parseSearch({ items: [item('dQw4w9WgXcQ'), item('dQw4w9WgXcQ')] })).toEqual([
      { id: 'dQw4w9WgXcQ', title: "T & 'x'", channel: 'Kênh', thumbnailUrl: 'https://i.ytimg.com/vi/a/mq.jpg' },
    ]);
  });

  it('drops malformed ids, missing titles and foreign thumbnail hosts', () => {
    const evil = { ...item('dQw4w9WgXcQ'), snippet: { title: 'x', thumbnails: { medium: { url: 'https://evil.test/a.jpg' } } } };
    expect(parseSearch({ items: [item('short'), item('javascript:1'), item('aaaaaaaaaaa', ''), evil] })).toEqual([
      { id: 'dQw4w9WgXcQ', title: 'x', channel: null, thumbnailUrl: null },
    ]);
    expect(parseSearch(null)).toEqual([]);
  });

  it('drops a re-upload with the same title and channel', () => {
    expect(parseSearch({ items: [item('dQw4w9WgXcQ'), item('aaaaaaaaaaa')] }).map((v) => v.id)).toEqual(['dQw4w9WgXcQ']);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
