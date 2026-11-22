# Athena MVP: remaining tasks

Tracks the work left after the Gemini learning-path chat (see `superpowers/specs/2026-11-20-gemini-learning-path-design.md`).
Goal: PROJECT_SPEC §16 loop: create path → study generated lesson → watch resource → quiz → complete → progress + streak → resume.

Notes: e2e tests run on RabbitMQ vhost `e2e` (see packages/api/README). Gemini model moved to `gemini-3.8-flash`
(2.5-flash is retired for this key); every response-schema string has a maxLength (3.x loops without one).

Decisions (owner, 2026-11-22): YouTube Data API when `YOUTUBE_API_KEY` is set, else a YouTube search link; videos embedded in-app.
Community rail removed. Toast for every API/network error app-wide (field validation stays inline). Path management: delete only.
Defaults taken (spec recommendations): one quiz per lesson, 5 single-choice questions, retries keep every attempt; a lesson can be
completed without a quiz; a learning day = a completed lesson or a submitted quiz attempt; activity dates are fixed at event time.

## Phase A: Foundation

- [x] **A1. Task list** (this file).
- [x] **A2. Native deps**: `react-native-webview` installed, dev client rebuilt on the Android device.
  _Accept_: app boots on device from the new build.
- [x] **A3. Toast**: in-house toast (reanimated, safe-area aware, a11y live region), mounted once in `_layout.tsx`, _(seen on device)_
  `toast.error()` callable from anywhere.
  _Accept_: an API error on any screen shows a Vietnamese toast.
- [x] **A4. Toast everywhere**: create-path chat and sign-in/sign-up API errors go to toast; action buttons (retry, start over) stay. _(seen on device)_

## Phase B: Data model (one migration)

- [x] **B1. Migration** `ExtendLearning`:
  - `learning_paths`: `preferences jsonb`, `content_language varchar(16)` (backfilled from the conversation, default `vi`).
  - `path_lessons`: `content jsonb null`, `search_keywords jsonb null`, `content_generated_at`.
  - `lesson_resources` (lesson fk cascade, `provider`, `external_id`, `title`, `channel`, `thumbnail_url`, `url`, `position`).
  - `quizzes` (unique lesson fk cascade, `questions jsonb` incl. answer key: server only).
  - `quiz_attempts` (quiz fk cascade, user fk cascade, `answers jsonb`, `correct`, `total`).
  - `lesson_progress` (unique user+lesson, `status`, `started_at`, `completed_at`).
  - `daily_activity` (unique user+`activity_date`, `count`; no lesson fk, so history survives deleting a path).
  - `users`: `current_streak`, `longest_streak`, `last_activity_date`.
  - `ai_jobs`: partial unique index on (`type`, `input->>'lessonId'`) while queued/running.
  _Accept_: `migration:run`, `migration:revert`, `migration:run` all succeed.

## Phase C: Lesson content and resources

- [x] **C1. Path generation stores context**: generate output carries `language` (that of the user's input); handler saves preferences + language on the path.
- [x] **C2. Job framework generalised**: `generate_lesson` / `generate_quiz` types, idempotency per lesson, a deleted lesson ends the job with `JobError('LESSON_NOT_FOUND')`.
- [x] **C3. Lesson AI**: `LessonAi` seam + Gemini adapter (per-call timeout/token cap), structured output
  `{intro, sections[{heading, body, example?}], takeaways[], practice?, keywords[]}`, validated before save; test fake.
- [x] **C4. YouTube search**: `YOUTUBE_API_KEY` optional; `search.list type=video videoEmbeddable=true safeSearch=strict`, IDs validated
  against `^[A-Za-z0-9_-]{11}$`, stored once at content generation; failure never fails the lesson.
- [x] **C5. Lesson endpoints**: `GET /lessons/:id` (content, resources, progress, quiz summary, opens → in progress),
  `POST /lessons/:id/generate-content` (202 job, idempotent, reuses stored content).
  _Accept_: e2e: generate → job.updated → content readable; second call doesn't regenerate.

## Phase D: Quiz

- [x] **D1. Quiz AI + validation**: grounded in stored lesson content; reject missing/duplicate options, out-of-range answer.
- [x] **D2. Quiz endpoints**: `POST /lessons/:id/quiz/generate` (202 job), `GET /lessons/:id/quiz` (no answer key),
  `POST /quizzes/:id/attempts` (server grading, explanations returned, records activity).
  _Accept_: answer key absent before submission; retry adds a new attempt.

## Phase E: Progress, streak, dashboard

- [x] **E1. Streak service**: local date from the user's IANA timezone in SQL, `daily_activity` insert `ON CONFLICT DO NOTHING`,
  streak bumped only on a new day, in the same transaction with the user row locked. Unit tests: first day, same day, next day,
  missed day, midnight boundary, timezone change, retry.
- [x] **E2. Complete lesson**: `POST /lessons/:id/complete` (idempotent) → progress, activity, streak.
- [x] **E3. Paths list/delete**: `GET /learning-paths` (active paths with progress + next lesson), `GET /learning-paths/:id` with lesson ids
  and per-lesson status, `DELETE /learning-paths/:id`.
- [x] **E4. Dashboard**: `GET /dashboard` → streak, longest, learned today, this week Mon–Sun (local), continue target, totals.
- [x] **E5. Timezone**: `PATCH /auth/me` `{timezone}` validated as IANA; the app sends the device zone once signed in.

## Phase F: App screens

- [x] **F1. Home**: real dashboard (streak card, continue learning, recent paths), sample data and community rail removed; empty state.
- [x] **F2. Courses**: real list with progress, delete with confirmation; empty state. _(seen on device)_
- [x] **F3. Path detail** `/paths/[id]`: modules, lessons with done/in-progress marks, progress bar. _(seen on device)_
- [x] **F4. Lesson** `/lessons/[id]`: generating / failed+retry / content states, embedded YouTube (or search link), mark complete. _(seen on device)_
- [x] **F5. Quiz** `/lessons/[id]/quiz`: generate, answer, submit, result with explanations, retry. _(seen on device)_
- [x] **F6. Profile**: name, email, timezone, streak stats, sign out. _(seen on device)_
- [x] **F7. After starting a path** from review, land on its detail screen. _(seen on device)_

## Phase G: Verification

- [x] **G1.** API unit + e2e suites green; app `tsc` + lint clean (no new errors).
- [x] **G2.** Device walk-through over adb of the full §16 loop, incl. empty, error (toast) and loading states.
  - [x] App boots from the rebuilt dev client; Home shows live dashboard data (empty state, streak week).
  - [x] Toast on device: API 404 on lesson and path screens, network failure on the chat screen; Retry kept.
  - [x] Courses empty state; Profile with real name, email, timezone and stats.
  - [x] Chat → generate → review edit → path detail → lesson (generation, in-app video playback) → quiz (graded, explanations,
    retry history) → complete → path progress → Home streak/continue → Courses list + delete confirm (cancelled).
    MIUI needed a phone reboot before `adb shell input` worked.
  - Fixed during the walk-through: chat dropped `level` and polluted `topic` on gemini-3.8-flash (schema `propertyOrdering`);
    quiz result rendered off-screen (scroll to top); long button label; prose examples in monospace; duplicate re-uploaded videos.
- [x] **G3.** README / API docs updated for the new routes and `YOUTUBE_API_KEY`.

## Changes after review

- [x] **H1.** Chat no longer asks daily study time; `ready` = narrowed topic + level (goal optional). Vague/broad topics
  ("lập trình", "AI", "tiếng Anh") are not recorded: the chatbot asks a narrowing question with 3–4 specific options.
- [x] **H2.** Path generation is sized by topic, level and goal only; every lesson teaches one concrete concept (no overview
  lessons). Lesson content goes deep (exact rules/syntax, edge cases, common mistakes, worked examples).
- [x] **H3.** Skeleton loading states instead of spinners; create screen slides in from the right; no refresh spinner when
  switching tabs (only on pull).

## Deferred

Archive/rename/reorder paths, activity calendar beyond the current week, per-user AI quotas beyond route throttles,
spaced repetition, offline, iOS device check (Android only here).
