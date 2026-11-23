import { ApiError, authFetch } from '@/lib/api';
import type { Level } from '@/lib/learning-paths-api';

// Mirrors packages/api src/modules/community/dto.ts.
export type CommunityPath = {
  id: string;
  title: string;
  summary: string;
  category: { id: string; name: string } | null;
  tags: string[];
  level: Level | null;
  moduleCount: number;
  lessonCount: number;
  copies: number;
  /** The caller's copy of it, if any. */
  copiedPathId: string | null;
};
export type CommunityPathDetail = CommunityPath & { modules: { title: string; lessons: { title: string }[] }[] };
export type CommunityCategory = { id: string; name: string; count: number };
export type CommunityQuery = { q?: string; category?: string; tag?: string };

export const listCommunityPaths = ({ q, category, tag }: CommunityQuery) => {
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (category) qs.set('category', category);
  if (tag) qs.set('tag', tag);
  return authFetch<{ items: CommunityPath[] }>(`/community/paths?${qs}`).then((r) => r.items);
};
export const getCommunityPath = (id: string) => authFetch<CommunityPathDetail>(`/community/paths/${id}`);
export const getCategories = () => authFetch<CommunityCategory[]>('/community/categories');
export const getRecommendations = () => authFetch<CommunityPath[]>('/community/recommendations');

/** The learner's path for this course: a new copy, their existing one, or (409) the path that already teaches it. */
export const copyCommunityPath = (id: string) =>
  authFetch<{ id: string }>(`/community/paths/${id}/copy`, { method: 'POST' }).catch((e: unknown) => {
    if (e instanceof ApiError && e.code === 'ALREADY_LEARNING') return { id: (e.body as { pathId: string }).pathId };
    throw e;
  });
