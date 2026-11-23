import { ApiError, authFetch } from '@/lib/api';
import type { JobView } from '@/lib/learning-paths-api';

// Mirrors the lessons, dashboard and learning-paths controllers in packages/api.
export type StreakView = { current: number; longest: number; learnedToday: boolean; today: string; week: boolean[] };
export type PathSummary = {
  id: string;
  title: string;
  summary: string;
  done: number;
  total: number;
  next: { id: string; title: string } | null;
  lastActiveAt: string;
  /** Copied from a Community course: deleting removes it (an original is only hidden from the learner). */
  isCopy: boolean;
};
export type Dashboard = {
  streak: StreakView;
  continue: { lessonId: string; lessonTitle: string; pathId: string; pathTitle: string; done: number; total: number } | null;
  paths: PathSummary[];
  totals: { completedLessons: number; quizAttempts: number; paths: number };
};
export type LessonContent = {
  intro: string;
  sections: { heading: string; body: string; example?: string }[];
  takeaways: string[];
  practice?: string;
};
export type Lesson = {
  id: string;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed';
  path: { id: string; title: string; status: 'draft' | 'active' };
  moduleTitle: string;
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
  content: LessonContent | null;
  contentJob: JobView | null;
  videos: { videoId: string; title: string; channel: string | null; thumbnailUrl: string | null }[];
  searchQuery: string;
  quiz: { id: string; questionCount: number; lastAttempt: { correct: number; total: number } | null } | null;
  quizJob: JobView | null;
};
export type Quiz = {
  id: string;
  lessonId: string;
  questions: { prompt: string; options: string[] }[];
  attempts: number;
  best: { correct: number; total: number } | null;
};
export type AttemptResult = {
  id: string;
  correct: number;
  total: number;
  results: { selected: number; answer: number; correct: boolean; explanation: string }[];
  streak: StreakView;
};
export type CompleteResult = { status: 'completed'; pathProgress: { done: number; total: number }; streak: StreakView };
export type Me = {
  id: string;
  email: string;
  fullName: string;
  dateOfBirth: string;
  timezone: string;
  avatarUrl: string | null;
};

export const getDashboard = () => authFetch<Dashboard>('/dashboard');
export const listPaths = () => authFetch<PathSummary[]>('/learning-paths');
export const deletePath = (id: string) => authFetch<void>(`/learning-paths/${id}`, { method: 'DELETE' });
export const getLesson = (id: string) => authFetch<Lesson>(`/lessons/${id}`);
export const generateLesson = (id: string) => authFetch<JobView>(`/lessons/${id}/generate-content`, { method: 'POST' });
export const completeLesson = (id: string) => authFetch<CompleteResult>(`/lessons/${id}/complete`, { method: 'POST' });
export const generateQuiz = (lessonId: string) => authFetch<JobView>(`/lessons/${lessonId}/quiz/generate`, { method: 'POST' });
export const getQuiz = (lessonId: string) => authFetch<Quiz>(`/lessons/${lessonId}/quiz`);
export const submitAttempt = (quizId: string, answers: number[]) =>
  authFetch<AttemptResult>(`/quizzes/${quizId}/attempts`, { method: 'POST', json: { answers } });
export const getMe = () => authFetch<Me>('/auth/me');

/** Uploads a local JPEG straight to S3 through a signed URL, then makes it the profile photo. */
export async function uploadAvatar(jpegUri: string): Promise<Me> {
  const { key, uploadUrl } = await authFetch<{ key: string; uploadUrl: string }>('/auth/me/avatar/upload-url', {
    method: 'POST',
  });
  const body = await (await fetch(jpegUri)).blob();
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body });
  if (!put.ok) throw new ApiError(put.status, { message: 'Không tải được ảnh lên. Thử lại sau nhé.' });
  return authFetch<Me>('/auth/me/avatar', { method: 'PUT', json: { key } });
}
export const updateProfile = (body: { fullName: string; dateOfBirth: string }) =>
  authFetch<Me>('/auth/me', { method: 'PATCH', json: body });
export const updateTimezone = (timezone: string) => authFetch<Me>('/auth/me', { method: 'PATCH', json: { timezone } });
