# Athena API

Backend for **Athena**, a personal AI learning companion. A user enters a topic, their level and a goal; the API generates a structured learning path (modules → lessons), then generates lesson content, finds learning resources, builds quizzes, grades attempts, and tracks progress and daily streaks.

Built with [NestJS](https://nestjs.com) 12 (ESM) and part of the `athena` pnpm monorepo, next to the Expo mobile app in `packages/app`.

> **Status:** scaffold only. The app still contains just the default NestJS `AppController` / `AppService`. Everything below the "Setup" section describes the **planned** MVP from [`docs/PROJECT_SPEC.md`](../../docs/PROJECT_SPEC.md). Database, ORM, auth, AI provider and job queue have not been chosen yet. See spec §14 for the open decisions.

## Setup

Requires Node 24+ and pnpm 11 (pinned in the root `package.json`).

```bash
# from the repo root
pnpm install

pnpm dev:api                 # watch mode (same as pnpm --filter api start:dev)
```

Local services (Postgres, Redis, Mailpit, LocalStack S3) and the schema, from `packages/api`:

```bash
docker compose up -d
pnpm migration:run           # migration:revert, migration:generate src/database/migrations/<Name>
```

When `NODE_ENV=development`, API docs (Swagger UI) are served at `/docs` and the OpenAPI JSON at `/docs-json`, e.g. http://localhost:8080/docs. They are generated from the DTOs, class-validator rules and doc comments by the `@nestjs/swagger` CLI plugin (`nest-cli.json`), so they stay in sync with the code.

From `packages/api`:

```bash
pnpm start                   # run once
pnpm start:dev               # watch mode
pnpm start:debug             # watch + debugger
pnpm build && pnpm start:prod

pnpm test                    # unit tests (vitest)
pnpm test:e2e                # e2e tests
pnpm test:cov                # coverage
pnpm lint                    # oxlint (type-aware)
pnpm format                  # prettier
```

### Configuration

Environment variables are read from `.env` (never commit it).

| Variable | Status  | Purpose                                    |
| -------- | ------- | ------------------------------------------ |
| `PORT`   | in use  | HTTP port, defaults to `3000`              |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | in use | PostgreSQL (TypeORM) |
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` | in use | Refresh tokens and revoked access tokens |
| `JWT_SECRET` | in use | HS256 signing key, at least 32 bytes (`openssl rand -base64 48`) |
| AI provider key | planned | LLM calls; server-side only        |
| YouTube Data API key | planned | Resource discovery; server-side only |

AI and YouTube keys must never be shipped to the mobile client.

## MVP scope

The API supports one complete learning loop:

**create a goal → AI learning path → study a generated lesson → open a resource → take a quiz → mark the lesson done → progress and streak update → come back and continue.**

Out of scope for the MVP: admin course authoring, a public catalog, social features, leaderboards, payments, open-ended AI chat tutor, video hosting, complex badges, collaborative paths, offline sync (spec §2.2).

## Planned endpoints

These are proposals from spec §8. Every route needs authentication and checks that the user owns the resource.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `POST` | `/learning-paths` | Create a path and request AI generation |
| `GET` | `/learning-paths` | List the current user's paths |
| `GET` | `/learning-paths/:pathId` | Path with modules and lessons |
| `PATCH` | `/learning-paths/:pathId` | Update editable metadata |
| `DELETE` | `/learning-paths/:pathId` | Archive or delete |
| `GET` | `/lessons/:lessonId` | Lesson details and stored content |
| `POST` | `/lessons/:lessonId/generate-content` | Generate content if missing |
| `POST` | `/lessons/:lessonId/complete` | Mark completed (no quiz required) |
| `GET` | `/lessons/:lessonId/resources` | External resources |
| `POST` | `/lessons/:lessonId/quiz/generate` | Generate a quiz if none exists |
| `GET` | `/lessons/:lessonId/quiz` | Quiz questions **without** answer keys |
| `POST` | `/quizzes/:quizId/attempts` | Submit answers and get the graded result |
| `GET` | `/quizzes/:quizId/attempts` | The user's past attempts |
| `GET` | `/dashboard` | Summary, "continue learning" target, streak |
| `GET` | `/activity` | Recent daily activity |
| `GET` | `/streak` | Current/longest streak and today's status |

## Planned database

Designed for PostgreSQL (not chosen yet; `uuid`, `jsonb`, `timestamptz` and `enum` map easily to other SQL databases). Diagram source: [`docs/database.mmd`](docs/database.mmd).

![Athena database diagram](docs/database.png)

**Relationships**

| Parent | Child | Type | On delete |
| ------ | ----- | ---- | --------- |
| `users` | `learning_paths` | 1 → N | cascade |
| `users` | `user_learning_stats` | 1 → 0..1 | cascade |
| `users` | `daily_activities`, `lesson_progress`, `quiz_attempts` | 1 → N | cascade |
| `learning_paths` | `learning_modules` | 1 → N | cascade |
| `learning_modules` | `lessons` | 1 → N | cascade |
| `lessons` | `lesson_resources`, `lesson_progress` | 1 → N | cascade |
| `lessons` | `quizzes` | 1 → 0..1 | cascade |
| `quizzes` | `quiz_questions`, `quiz_attempts` | 1 → N | cascade |
| `quiz_attempts` | `quiz_attempt_answers` | 1 → N | cascade |
| `quiz_questions` | `quiz_attempt_answers` | 1 → N | cascade |

**Constraints that enforce business rules**

- `lesson_progress (user_id, lesson_id)` unique: one progress row per user and lesson.
- `daily_activities (user_id, activity_date)` unique: a day counts once, so retries and concurrent requests can't bump the streak twice.
- `quizzes.lesson_id` unique: one quiz per lesson, and concurrent generation requests can't create duplicates.
- `quiz_attempt_answers (quiz_attempt_id, question_id)` unique: one answer per question per attempt.
- `(parent_id, sort_order)` unique on modules, lessons and questions keeps ordering deterministic.
- `quiz_questions.correct_option_id` is never sent to the client before the attempt is submitted.
- Path progress is computed from `lesson_progress`, not stored. `user_learning_stats` is a cache that is updated in the same transaction as `daily_activities`.

To regenerate the image after editing the `.mmd` file:

```bash
npx -y @mermaid-js/mermaid-cli -i docs/database.mmd -o docs/database.png -b white -s 2
```

## Rules the implementation must follow

**AI generation**

- Keep prompts, output schemas and provider calls behind a service/adapter, away from controllers. Version the prompts and schemas, and make the model configurable.
- Use structured output / JSON Schema, then validate again on the backend. Never persist unvalidated model output.
- Treat model output as untrusted. Never execute generated code or render unsanitized HTML.
- Generate lesson content and quizzes on demand, store them, and reuse them. Protect against duplicate concurrent generation for the same target.
- Track generation status (`pending → processing → completed | failed`) with a user-safe error message. Never overwrite valid content with an empty or invalid result.
- Reject quiz output with missing or duplicate options, an invalid answer reference, or anything other than exactly one correct answer.

**Resources**

- YouTube links come from the YouTube Data API (or another verifiable source). The LLM may suggest search keywords, never URLs.
- Validate URLs and video IDs. If nothing reliable is found, return no resource. Do not make one up.

**Quizzes**

- Answer keys stay on the server until the attempt is submitted.
- Grade with the stored answer key, not a new AI call. Retries create new attempts and keep the old ones.

**Progress and streaks**

- A day qualifies when the user completes a lesson or submits a quiz attempt. Multiple actions on the same day count once.
- Use the user's IANA timezone (e.g. `Asia/Ho_Chi_Minh`) for the activity date, never the server's UTC date. Store the local date when the event happens and don't rewrite history when the timezone changes.
- A missed day resets the current streak on the next qualifying activity.
- Run completion, quiz submission and streak updates in a transaction, and rely on the unique daily-activity record so retries and concurrent requests can't double-count.

**General**

- Validate every request body and path parameter, return consistent error formats, and make state-changing requests safe to retry.
- Rate-limit AI endpoints and consider per-user quotas.
- Log generation start, completion and failure with request IDs, latency and token usage. Never log keys, tokens or unnecessary user content.
- Test the business rules, especially timezone and streak edge cases: midnight, timezone changes, missed days, concurrent and retried requests.

## Roadmap

Spec §13:

0. Repository discovery and technical plan (`PLAN.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `OPEN_QUESTIONS.md`)
1. Foundation: auth, user profile, schema and migrations, path/module/lesson CRUD
2. AI learning-path generation
3. Lesson content and YouTube resources
4. Quiz generation, attempts and grading
5. Progress, dashboard and streak
6. Hardening: security review, cost/rate limits, observability, tests

## License

UNLICENSED, private project.
