import type { ActiveCourse } from '@/components/home-sections';

// shortcut: static sample data, replace with the learning-paths API once it exists.
export const ACTIVE: ActiveCourse[] = [
  { id: 'ts', title: 'TypeScript cho người mới', next: 'Bài 3 · Union type', done: 6, total: 12 },
  { id: 'sql', title: 'SQL căn bản', next: 'Bài 2 · JOIN', done: 1, total: 10 },
];
