# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

General self-learners: individuals learning any subject on their own (programming, databases, English grammar, machine learning, personal finance, and so on) who don't know where to start, have materials scattered across articles and videos, and struggle to measure progress or stay consistent without a formal course. They use the app in short, repeatable sessions on their phone.

## Product Purpose

Athena is a personal AI learning companion. The user enters a topic, their current level (Beginner / Intermediate / Advanced), an optional goal, available study time and content language. AI produces a structured learning path of ordered modules and lessons. Lessons are generated on demand (objectives, theory, examples, key takeaways, verified external resources), each with a quiz graded on the server. Completing lessons updates progress and a daily streak.

Success for the MVP is one reliable, understandable loop for a single user: create a goal → receive a path → study a generated lesson → use a resource → complete a quiz → mark the lesson done → see progress and streak update → come back and continue.

## Positioning

The user owns the path. Athena turns that user's own goal into a path built for them, instead of a catalog course someone else wrote. AI proposes the structure and the user can review and edit it. Content is grounded: quizzes come from the lesson text, and resources come from verifiable providers, never from invented URLs.

## Operating Context

- Short mobile sessions; the main return action is "Continue learning", which picks up the most recent incomplete lesson.
- Primary navigation (proposed in the spec): Home (streak, progress, continue learning, recent paths), My Learning (manage paths), Create (new path), Profile (account, timezone, language, settings).
- Core screens: sign in/up, home dashboard, create path, generation loading/failure, path detail, lesson detail, quiz, quiz result, activity/streak, profile/settings.
- AI generation is slow and can fail. Generated, generating and failed content must always be distinguishable, with retry.
- External resources (YouTube, articles) open in a browser or supported video experience.

## Capabilities and Constraints

- Stack: pnpm monorepo, with the Expo app (SDK 58, Expo Router) in `packages/app` and the NestJS API in `packages/api`.
- **Language: Vietnamese only for the MVP.** Both UI copy and generated content are in Vietnamese.
- **Auth: email + password against Athena's own API only.** No Google, Apple or other third-party sign-in. Users must sign in before using the app; onboarding is a short demo of the loop with no inputs.
- Single-choice quizzes, 5 questions by default, retries allowed, explanations shown after submission. Answer keys never reach the client before grading.
- A lesson can be marked complete without taking its quiz. Quiz completion and lesson completion are separate states.
- Streak: at most one per local calendar day, based on the user's IANA timezone. It is not the only measure of learning success.
- Lesson content is sanitized Markdown or structured JSON. It is never raw HTML from the model.
- Out of scope for MVP: admin course authoring, catalog/marketplace, social features, leaderboards, payments, open-ended AI chat tutor, live/hosted video, complex badges/achievements, collaboration, offline sync.
- Open decisions (spec §14): password reset and email verification flow, AI provider, whether path editing/reordering ships in v1, one quiz per lesson vs fresh per attempt, streak qualification rule, generation UX (blocking vs background polling), YouTube API quota, monetization.

## Brand Commitments

- "Athena" is a provisional working name, pending app-store, domain and trademark checks.
- The spec sets the tone: modern, calm, friendly, focused; subtle gamification, not a noisy game UI. It names a flame motif for the streak, used sparingly with few badges or animations.

## Evidence on Hand

- Product spec: `docs/PROJECT_SPEC.md`.
- No users, testimonials, metrics or brand assets exist yet. The app still has the default Expo template screens and icons. Do not fabricate learner counts, outcomes or reviews.

## Product Principles

1. **User-owned learning.** The user creates the path and stays in control; AI assists, it doesn't dictate.
2. **Grounded, never fabricated.** Every quiz question comes from the lesson, every resource is verifiable, and no mastery or completion date is promised.
3. **Progressive generation.** Generate only what is needed next, and show its state honestly (generating, ready, failed, retry).
4. **Make returning effortless.** The next lesson is always one obvious tap away, and progress is always visible.
5. **MVP first.** Validate the core loop before adding social features, deeper gamification or tutoring.

## Accessibility & Inclusion

- Readable contrast, clear interaction states, and lesson text that stays legible on small screens (spec §10).
- Vietnamese text must render correctly, including diacritics and stacked tone marks, in every typeface and size used.
