import { authFetch, ApiError } from '@/lib/api';

// Mirrors the conversations, jobs and learning-paths controllers in packages/api.
export type Level = 'beginner' | 'intermediate' | 'advanced';
export const LEVEL_LABEL = { beginner: 'Cơ bản', intermediate: 'Trung cấp', advanced: 'Nâng cao' } as const;
export type Preferences = { topic?: string; level?: Level; goal?: string };
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
export type JobType = 'generate_path' | 'generate_lesson' | 'generate_quiz';
export type JobView = { id: string; type: JobType; status: JobStatus; resultId: string | null; errorCode: string | null };
export type LessonStatus = 'not_started' | 'in_progress' | 'completed';
export type LearningPath = {
  id: string;
  status: 'draft' | 'active';
  title: string;
  summary: string;
  progress: { done: number; total: number };
  modules: { id: string; title: string; lessons: { id: string; title: string; status: LessonStatus }[] }[];
};
/** Review edits: titles only; the server rejects any other field. */
export type ModuleEdit = { title: string; lessons: { title: string }[] };

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

export const startPath = (id: string, modules?: ModuleEdit[]) =>
  authFetch<LearningPath>(`/learning-paths/${id}/start`, {
    method: 'POST',
    json: { modules: modules?.map((m) => ({ title: m.title, lessons: m.lessons.map((l) => ({ title: l.title })) })) },
  });
