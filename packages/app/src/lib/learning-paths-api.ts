import { apiFetch } from '@/lib/api';

// Mirrors LearningPathsController in packages/api/src/modules/learning-paths.
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Preferences = { topic?: string; level?: Level; goal?: string; dailyMinutes?: number };
export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type ChatReply = { reply: string; quickReplies: string[]; preferences: Preferences; ready: boolean };
export type LearningPath = {
  id: string;
  status: 'draft' | 'active';
  title: string;
  summary: string;
  modules: { title: string; lessons: { title: string }[] }[];
};

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export const chatPath = (token: string, messages: ChatMessage[], preferences: Preferences) =>
  apiFetch<ChatReply>('/learning-paths/chat', { method: 'POST', json: { messages, preferences }, headers: auth(token) });

export const generatePath = (token: string, preferences: Preferences) =>
  apiFetch<LearningPath>('/learning-paths/generate', { method: 'POST', json: { preferences }, headers: auth(token) });

export const startPath = (token: string, id: string, modules?: LearningPath['modules']) =>
  apiFetch<LearningPath>(`/learning-paths/${id}/start`, { method: 'POST', json: { modules }, headers: auth(token) });
