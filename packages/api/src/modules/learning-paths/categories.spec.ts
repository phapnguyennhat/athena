import { describe, expect, it } from 'vitest';
import { SEED } from '../../database/migrations/1763800000000-AddCategories.js';
import { slugify } from './categories.js';

describe('slugify', () => {
  it('strips Vietnamese diacritics, case and punctuation', () => {
    expect(slugify('Lập trình')).toBe('lap-trinh');
    expect(slugify('  LẬP   Trình ')).toBe('lap-trinh');
    expect(slugify('Đồ họa & Thiết kế')).toBe('do-hoa-thiet-ke');
    expect(slugify('Dữ liệu & AI')).toBe('du-lieu-ai');
    expect(slugify('!!!')).toBe('');
  });
});

describe('seeded categories', () => {
  it('store slugify(name) as their slug', () => {
    for (const [slug, name] of SEED) expect(slugify(name)).toBe(slug);
  });
});
