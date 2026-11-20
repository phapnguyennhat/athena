import { authFetch, ApiError } from '@/lib/api';

// Mirrors the conversations, jobs and learning-paths controllers in packages/api.
export type Level = 'beginner' | 'intermediate' | 'advanced';
export type Preferences = { topic?: string; level?: Level; goal?: string; dailyMinutes?: number };
export type ChatMessage = { role: 'user' | 'assistant'; content: string; quickReplies: string[] | null };
export type ChatReply = { reply: string; quickReplies: string[]; preferences: Preferences; ready: boolean };
export type ConversationView = {
  id: string;
  messages: ChatMessage[];
  preferences: Preferences;
  ready: boolean;
  activeJob: { id: string; status: 'queued' | 'running' } | null;
  draftPathId: string | null;
};
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type JobView = { id: string; type: 'generate_path'; status: JobStatus; resultId: string | null; errorCode: string | null };
export type LearningPath = {
  id: string;
  status: 'draft' | 'active';
  title: string;
  summary: string;
  modules: { title: string; lessons: { title: string }[] }[];
};

export const getCurrentConversation = () =>
  authFetch<ConversationView>('/learning-paths/conversations/current').catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });

export const startConversation = () => authFetch<ConversationView>('/learning-paths/conversations', { method: 'POST' });

export const sendMessage = (id: string, content: string) =>
  authFetch<ChatReply>(`/learning-paths/conversations/${id}/messages`, { method: 'POST', json: { content } });

export const generatePath = (conversationId: string) =>
  authFetch<JobView>(`/learning-paths/conversations/${conversationId}/generate`, { method: 'POST' });

export const getJob = (id: string) => authFetch<JobView>(`/jobs/${id}`);

export const getPath = (id: string) => authFetch<LearningPath>(`/learning-paths/${id}`);

export const startPath = (id: string, modules?: LearningPath['modules']) =>
  authFetch<LearningPath>(`/learning-paths/${id}/start`, { method: 'POST', json: { modules } });
