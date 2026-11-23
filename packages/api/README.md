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

Local services (Postgres, Redis, Mailpit, RabbitMQ, LocalStack S3) and the schema, from `packages/api`. The API and the e2e suite (`pnpm test:e2e`) both need RabbitMQ running, so start the stack first:

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
| `NODE_ENV` | in use | `development` serves Swagger at `/docs`; `production` requires TLS for SMTP |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | in use | Outgoing mail. Locally Mailpit (`localhost:1025`, no auth, inbox at http://localhost:8025). In production the provider's SMTP server: `SMTP_SECURE=true` for port 465, otherwise STARTTLS is required |
| `MAIL_FROM` | in use | Sender, e.g. `Athena <no-reply@example.com>` |
| `RABBITMQ_URL` | required | AMQP URL of the AI job queue. Locally `amqp://<RABBITMQ_USER>:<RABBITMQ_PASSWORD>@localhost:5672` |
| `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | required by `docker compose` | Credentials the local RabbitMQ container is created with; must match `RABBITMQ_URL` |
| `TYPESENSE_URL` | required | Typesense server for community course search. Locally `http://localhost:8108` (`docker compose up -d typesense`) |
| `TYPESENSE_API_KEY` | required | Typesense admin key; `docker compose` starts the local server with it. Rebuild the index with `pnpm search:reindex` |
| `TYPESENSE_COLLECTION` | optional | Collection name, default `community_paths`; e2e uses its own |
| `RABBITMQ_PORT`, `RABBITMQ_UI_PORT` | optional | Host ports of the local RabbitMQ container, default `5672` and `15672` (management UI at http://localhost:15672) |
| `GEMINI_API_KEY` | required | Gemini API key; server-side only |
| `GEMINI_MODEL` | optional | Gemini model, default `gemini-3.8-flash` |
| `YOUTUBE_API_KEY` | optional | YouTube Data API v3 key; server-side only. Set: each lesson stores up to 3 verified, embeddable videos (one `search.list` ≈ 100 quota units, once per lesson). Unset: the app links to a YouTube search instead |

AI and YouTube keys must never be shipped to the mobile client.

### Deploying

Run `pnpm migration:run`, then on the first deploy with community courses `pnpm search:reindex` to build the Typesense collection from Postgres. `TYPESENSE_URL` and `TYPESENSE_API_KEY` are required.

## MVP scope

The API supports one complete learning loop:

**create a goal → AI learning path → study a generated lesson → open a resource → take a quiz → mark the lesson done → progress and streak update → come back and continue.**

Out of scope for the MVP: admin course authoring, a public catalog, social features, leaderboards, payments, open-ended AI chat tutor, video hosting, complex badges, collaborative paths, offline sync (spec §2.2).

## Endpoints

Every route needs a bearer access token and only touches the current user's resources. Swagger (`/docs`) has the full request and response shapes.

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET` | `/learning-paths/conversations/current` | The open path-planning conversation with its messages (404 `CONVERSATION_NOT_FOUND` if none) |
| `POST` | `/learning-paths/conversations` | Start over: close the open conversation and open a new one with the greeting |
| `POST` | `/learning-paths/conversations/:id/messages` | One chat turn with the AI (20 a minute) |
| `POST` | `/learning-paths/conversations/:id/generate` | Queue path generation (202, returns the job; idempotent while a job is active; 5 an hour) |
| `GET` | `/jobs/:id` | Status of an AI job; `resultId` is the draft path once it succeeded |
| `GET` | `/learning-paths` | Active paths with progress and the next lesson, most recently studied first |
| `GET` | `/learning-paths/:id` | A path with its modules, lessons (ids and the user's status) and progress |
| `POST` | `/learning-paths/:id/start` | Accept the (optionally edited) draft: it becomes active and the conversation closes |
| `DELETE` | `/learning-paths/:id` | Delete a path with its lessons, quizzes, attempts and progress (204). Learning days and the streak stay |
| `GET` | `/lessons/:id` | Lesson content, videos, quiz summary and job states. Opening it marks it in progress |
| `POST` | `/lessons/:id/generate-content` | Queue lesson generation (202, job). Stored content is never regenerated |
| `POST` | `/lessons/:id/complete` | Mark completed (idempotent). Records the learning day; returns path progress and streak |
| `POST` | `/lessons/:id/quiz/generate` | Queue the lesson's quiz (202, job), built from its stored content. 409 `LESSON_NOT_READY` without content |
| `GET` | `/lessons/:id/quiz` | The quiz without answers (404 `QUIZ_NOT_FOUND` before it is generated) |
| `POST` | `/quizzes/:id/attempts` | Submit `{ answers: number[] }`: graded on the server, returns explanations; every attempt is kept and counts as a learning day |
| `GET` | `/dashboard` | Streak (current, longest, today, Mon–Sun week in the user's timezone), continue-learning target, paths, totals |
| `PATCH` | `/auth/me` | Update `{ timezone }` (IANA). Past learning days keep their date |

Job types on `ai.jobs`: `generate_path`, `generate_lesson`, `generate_quiz`; a lesson has at most one active job per type. Content language is detected when the path is generated (`learning_paths.content_language`) and used for every lesson and quiz.

**Streak rule:** a learning day is a completed lesson or a submitted quiz attempt, dated in the user's timezone at the time (`daily_activity`, one row per user and day). The streak grows by one per new day and restarts at 1 after a missed day; reads show 0 once a day has been missed.

**Live job status:** a socket.io namespace at `/events` (websocket transport only). Pass the access token as `auth: { token }` in the handshake; an invalid token gets `auth_error` and is disconnected. The server emits `job.updated` with `{ jobId, type, status, resultId, errorCode }` whenever one of the user's jobs changes, so the app need not poll `/jobs/:id`.

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

e2e suites share one RabbitMQ queue: if a dev server (`pnpm start:dev`) is running, it consumes the tests' jobs. Run them on their own vhost instead:
`docker compose exec rabbitmq rabbitmqctl add_vhost e2e && docker compose exec rabbitmq rabbitmqctl set_permissions -p e2e "$RABBITMQ_USER" ".*" ".*" ".*"`, then `RABBITMQ_URL=amqp://athena:athena@localhost:5672/e2e pnpm test:e2e`.

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
