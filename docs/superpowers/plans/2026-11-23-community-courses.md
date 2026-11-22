# Community Courses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every active original course is public and anonymous in a Community page (Typesense search, category/tag filters, suggestions) reached from Home; learners copy a course to learn it, and generated lesson content is shared by all copies so the LLM runs once per lesson.

**Architecture:** Lesson content, videos and quizzes move to a shared `lesson_contents` row that every lesson (original and copies) points at; generation claims the row so only one job calls the model. Copies are ordinary learner paths with `source_path_id`; an owner deleting an active original only hides it. Typesense holds one document per public course, kept in sync by an idempotent consumer on its own RabbitMQ queue.

**Tech Stack:** NestJS + TypeORM (raw SQL migrations) + Postgres 17, RabbitMQ (`@nestjs/microservices` RMQ), Typesense (`typesense` npm client, `typesense/typesense:29.0` image), Gemini; Expo SDK 58 + expo-router + NativeWind (`@/tw`). pnpm. vitest (unit `pnpm vitest run`, e2e `pnpm test:e2e`).

**Spec:** `docs/superpowers/specs/2026-11-22-community-courses-design.md`

## Global Constraints

- All user-facing text Vietnamese. Community responses never include `userId`, author, `conversationId` or `preferences.goal`.
- Public course = `status = 'active' AND source_path_id IS NULL` (hidden or not, deleted account or not).
- Lesson prompts never receive `goal` (for every path).
- Copies store `preferences = { topic, level }` (goal dropped).
- Waiting on another job's generation: claim stale after 3 min, give up after 4 min with `JobError('LESSON_BUSY')`.
- List `limit` default 20, max 50; recommendations default 10, max 20; `q` ≤ 100 chars.
- API formatting: prettier on changed files, `--print-width 120 --single-quote`. App: `npx tsc --noEmit` and `npx expo lint` clean.
- E2E runs on the RabbitMQ `e2e` vhost while a dev server is up: `RABBITMQ_URL=amqp://athena:athena@localhost:5672/e2e pnpm test:e2e`.
- Schema only via migrations (`synchronize: false`); migration timestamps after `1763800000000`.

## Review Focus

1. Two learners open the same ungenerated lesson at once → one model call, both get content. (Task 2 e2e)
2. A learner deletes their active original that others copied → copiers keep content; course still listed once. (Task 3 e2e)
3. Owner re-opens their hidden course from Community → same path, old progress, no copy. (Task 3 e2e)
4. Search with no diacritics ("nau an") finds "Nấu ăn"; Typesense down → 503, app shows Retry. (Task 4 e2e, Task 6 device)
5. Index stays right under duplicate/out-of-order messages (copy, start, category set). (Task 4 e2e)

---

### Task 1: Shared `lesson_contents` (schema + reads, no behavior change)

**Files:**
- Create: `packages/api/src/database/migrations/1763900000000-SharedLessonContent.ts`
- Create: `packages/api/src/modules/lessons/entities/lesson-content.entity.ts`
- Modify: `src/modules/learning-paths/entities/path-lesson.entity.ts` (drop `content`, `searchKeywords`, `contentGeneratedAt`; add `contentId`, `contentRow` relation)
- Modify: `src/modules/lessons/entities/lesson-resource.entity.ts` (`lessonId` → `contentId`), `quiz.entity.ts` (`lessonId` → `contentId`)
- Modify: `src/modules/learning-paths/learning-paths.service.ts` (`insertModules` creates content rows), `src/modules/lessons/lessons.service.ts` (view reads via content), `quizzes.service.ts` (quiz by content, submit ownership), `generate-lesson.handler.ts`, `generate-quiz.handler.ts` (write to content row)
- Modify: module `forFeature` lists, `docs/database.mmd`, affected specs/e2e
- Test: existing `test/lessons.e2e-spec.ts` must stay green; add `test/shared-content-migration.e2e-spec.ts`

**Interfaces:**
- Produces: `LessonContentEntity` on `lesson_contents { id, content: LessonContent|null, searchKeywords: string[]|null, generatedAt: Date|null, generatingSince: Date|null, quizGeneratingSince: Date|null, createdAt }`
- Produces: `PathLesson.contentId: string`, `PathLesson.contentRow?: Relation<LessonContentEntity>`; `LessonResource.contentId`; `Quiz.contentId` (unique)
- Produces: `OwnedLesson` gains `content: LessonContentEntity` (loaded by `findOwnedLesson`)

- [ ] **Step 1: Write the migration test** (`shared-content-migration.e2e-spec.ts`): with the DB migrated, insert path→module→lesson via `insertModules`, assert a `lesson_contents` row exists with `id = lesson.content_id`, and `path_lessons` has no `content` column (`information_schema.columns`).
- [ ] **Step 2: Run** it — Expected: FAIL (table missing).
- [ ] **Step 3: Migration `SharedLessonContent1763900000000`**:
  up: create `lesson_contents` (columns above, `id uuid PK DEFAULT gen_random_uuid()`); `INSERT INTO lesson_contents (id, content, search_keywords, generated_at, created_at) SELECT id, content, search_keywords, content_generated_at, created_at FROM path_lessons`; `ALTER TABLE path_lessons ADD content_id uuid`; `UPDATE path_lessons SET content_id = id`; `SET NOT NULL`; FK `FK_path_lessons_content` → lesson_contents `ON DELETE RESTRICT`; index `IDX_path_lessons_content`; drop the three old columns. `lesson_resources`: drop old lesson FK, rename `lesson_id`→`content_id`, FK `FK_lesson_resources_content` → lesson_contents `ON DELETE CASCADE`. `quizzes`: same rename, keep unique, FK `FK_quizzes_content` CASCADE. Look up existing FK/unique names with `\d` before writing `DROP CONSTRAINT`.
  down: reverse (comment: lossy once copies share a content row).
- [ ] **Step 4: Entities + `insertModules`** — for each lesson insert a `lesson_contents` row first (`m.insert(LessonContentEntity, rows)` returning ids) and set `contentId`.
- [ ] **Step 5: Reads/writes through content** — `findOwnedLesson` loads `contentRow`; `view` uses `content.content`, `content.searchKeywords`, resources/quiz by `contentId`; `generateQuiz` checks `content.content`; `QuizzesService.forLesson` finds quiz by the lesson's `contentId`; `submit`: quiz → caller must own a lesson with `content_id = quiz.contentId` (SQL join through modules→paths with `user_id`), else `QUIZ_NOT_FOUND`. Handlers write to `lesson_contents`/insert resources with `contentId` (same lock-and-check logic as today, on the content row).
- [ ] **Step 6: Run** `pnpm migration:run && pnpm vitest run && pnpm test:e2e` — Expected: all PASS (lessons/quizzes e2e unchanged).
- [ ] **Step 7: Commit** `refactor(api): lesson content, videos and quizzes live in shared lesson_contents`

### Task 2: Generate once per content row; lessons without goal

**Files:**
- Create: `packages/api/src/modules/lessons/content-claim.ts`
- Modify: `generate-lesson.handler.ts`, `generate-quiz.handler.ts`, `src/modules/lessons/lesson-output.ts` (drop `goal` from `LessonInput`), lesson prompt text if it mentions goal
- Test: `src/modules/lessons/content-claim.spec.ts` (if pure parts), `test/shared-generation.e2e-spec.ts`

**Interfaces:**
- Produces: `claimOrWait(ds: DataSource, contentId: string, column: 'generating_since' | 'quiz_generating_since', ready: () => Promise<boolean>, opts?: { pollMs?: number; staleMs?: number; giveUpMs?: number }): Promise<'claimed' | 'ready'>` — throws `JobError('LESSON_BUSY')` after `giveUpMs`
- Produces: `releaseClaim(ds, contentId, column): Promise<void>`

- [ ] **Step 1: Failing e2e** (`shared-generation.e2e-spec.ts`, app booted like `generate-path.e2e-spec.ts` with a counting `FakePathAi` whose `lesson()` waits 500 ms): create two users' paths whose lessons share one `content_id` (insert the second path's lesson with the first's `contentId` directly), call `POST /lessons/:id/generate-content` for both at once → both jobs `succeeded`, `ai.lessonCalls === 1`, both `GET /lessons/:id` return the same `content`. Same for quiz (`quizCalls === 1`, same quiz id). A third test: set `generating_since = now() - 4 min` on an empty row → a job claims it and generates. A fourth: fake `lesson()` throws non-transient → `generating_since` is NULL afterwards. A fifth: the `LessonInput` the fake receives has no `goal` key.
- [ ] **Step 2: Run** — Expected: FAIL (2 calls).
- [ ] **Step 3: Implement `claimOrWait`/`releaseClaim`** — claim SQL from the spec (`UPDATE … WHERE id=$1 AND <ready-column> IS NULL AND (col IS NULL OR col < now() - interval)` `RETURNING id`); loser polls `ready()` every `pollMs` (1000), retries the claim when stale (`staleMs` 180000), throws after `giveUpMs` (240000). Lesson: ready column `content`; quiz: ready = a `quizzes` row exists for `content_id` (pass a predicate, don't build SQL from the column name beyond the two allowed literals).
- [ ] **Step 4: Handlers** — `const r = await claimOrWait(...)`; `'ready'` → return lesson id / quiz id; `'claimed'` → model call; on any error `releaseClaim` then rethrow; on success write content and clear the claim in the same transaction. Remove `goal` from the lesson input.
- [ ] **Step 5: Run** `pnpm vitest run && pnpm test:e2e` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(api): generate each shared lesson and quiz once; lessons ignore goal`

### Task 3: Copy, hide-on-delete, owner reads

**Files:**
- Create: `packages/api/src/database/migrations/1764000000000-CopiesAndHiding.ts`
- Create: `packages/api/src/modules/community/community.module.ts`, `community.service.ts` (copy + detail + recommendations live here; Task 5 adds the controller)
- Modify: `learning-path.entity.ts` (`sourcePathId`, `hiddenAt`), `learning-paths.service.ts` (`remove`, `get`, `list`), `lessons.service.ts` (`findOwnedLesson`, `lastOpened` exclude hidden), `app.module.ts`
- Test: `test/copy-and-hide.e2e-spec.ts`

**Interfaces:**
- Produces: `CommunityService.copy(userId: string, pathId: string): Promise<{ id: string; created: boolean }>`; throws 404 `COURSE_NOT_FOUND`, 409 `ALREADY_LEARNING` (`{ pathId }` in body)
- Produces: `isPublic` SQL fragment constant `PUBLIC_PATH = "p.status = 'active' AND p.source_path_id IS NULL"` in `community.service.ts`
- Produces: `LearningPathsService.remove` semantics: active original → `hidden_at = now()`; copy/draft → delete + orphan `lesson_contents` cleanup
- Consumes: `insertModules` is NOT used for copies (copies reuse `content_id`); `PathLesson.contentId` (Task 1)

- [ ] **Step 1: Failing e2e** (`copy-and-hide.e2e-spec.ts`, call `CommunityService` directly plus HTTP for owner reads):
  - copy of A's active original by B → new active path, same `category_id`, `tags`, titles, `preferences` has no `goal`, each lesson's `content_id` equals the source lesson's; `source_path_id` set; second `copy` → same id, `created: false`.
  - copy own / draft / a copy → 404; B already learning that content via another path → 409.
  - A `DELETE /learning-paths/:id` on the original → `GET /learning-paths` (A) no longer lists it, `GET /learning-paths/:id` 404, lesson GET 404, row still exists with `hidden_at`; B's copy lessons still return content.
  - A `copy` of own hidden original → returns the same id, `hidden_at` NULL, old `lesson_progress` intact.
  - B deletes their copy → path gone, shared `lesson_contents` rows still exist (A uses them). Deleting an uncopied draft → its `lesson_contents` rows gone.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Migration** — `learning_paths.source_path_id uuid NULL` FK `FK_learning_paths_source` → learning_paths `ON DELETE SET NULL`, index `IDX_learning_paths_source`; `hidden_at timestamptz NULL`. Update `docs/database.mmd`.
- [ ] **Step 4: Implement** `copy` (one transaction; lock nothing beyond the copy's own rows; idempotency via `SELECT id FROM learning_paths WHERE user_id=$1 AND source_path_id=$2`; un-hide branch when the source is the caller's own hidden original), owner reads with `hidden_at IS NULL`, and `remove` per the spec. Orphan cleanup: `DELETE FROM lesson_contents c WHERE c.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM path_lessons l WHERE l.content_id = c.id)` with the ids collected before the delete.
- [ ] **Step 5: Run** `pnpm vitest run && pnpm test:e2e` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(api): copy community courses; deleting an active original hides it`

### Task 4: Typesense index kept in sync by a queue

**Files:**
- Modify: `packages/api/docker-compose.yml` (service `typesense`, image `typesense/typesense:29.0`, port 8108, `--api-key` from `TYPESENSE_API_KEY`, `--data-dir /data`, volume), `.env.example`/README env section, `src/config/env.validation.ts` (`TYPESENSE_URL`, `TYPESENSE_API_KEY` required), `src/main.ts` + e2e bootstraps (second `connectMicroservice` for the search queue)
- Create: `src/modules/search/search.constants.ts`, `search.module.ts`, `search-index.service.ts`, `search-index.consumer.ts`, `src/scripts/reindex-search.ts`; `package.json` script `"search:reindex": "nest build && node dist/scripts/reindex-search.js"`
- Modify: publish points — `learning-paths.service.start`, `generate-path.handler` (after commit, only if already active — normally no-op), `backfill-categories.ts`, `CommunityService.copy` (publish the **source** id)
- Test: `test/search-index.e2e-spec.ts`
- Dependency: `pnpm add typesense` in packages/api

**Interfaces:**
- Produces: `SEARCH_QUEUE = 'search.index'`, `SEARCH_DLQ = 'search.index.dlq'`, `searchConsumerOptions(url)` (prefetch 8), `SEARCH_CLIENT`
- Produces: `SearchIndexService.publish(pathId: string): Promise<void>` (never throws; logs on broker failure), `sync(pathId: string): Promise<'upserted' | 'deleted'>`, `ensureCollection(): Promise<void>` (on bootstrap), `reindexAll(): Promise<number>`, `search(params: { q?: string; categoryId?: string; tag?: string; limit: number }): Promise<{ ids: string[] }>`, `categoryFacets(): Promise<{ id: string; count: number }[]>`
- Produces: collection `community_paths` fields `id, title, summary, tags (string[], facet), category_id (string, facet, optional), category_name (optional), level (facet), lesson_count (int32), copies (int32, sort), created_at (int64, sort)`; `query_by: title,tags,summary`, `query_by_weights: 4,2,1`
- Consumes: `PUBLIC_PATH` (Task 3)

- [ ] **Step 1: Failing e2e** (`search-index.e2e-spec.ts`, real Typesense from compose, collection name suffixed per test run via env `TYPESENSE_COLLECTION` default `community_paths`):
  - `sync(publicPath)` → document exists; `sync` again → still one document; draft/copy → `deleted`.
  - `search({ q: 'nau an' })` finds a path titled "Nấu ăn món Việt" (if Typesense doesn't match, add `title_plain`/`tags_plain` fields filled with `slugify`-style text and query them too — record a ruling).
  - `search({ tag: 'sql' })`, `search({ categoryId })` filter correctly; ordering by `copies` desc.
  - publishing through RabbitMQ: after `start` of a draft via HTTP, the document appears within 5 s (poll).
  - `reindexAll()` returns the number of public paths and removes a stale document.
- [ ] **Step 2: Run** (after `docker compose up -d typesense`) — Expected: FAIL.
- [ ] **Step 3: Implement** module, client provider (parse `TYPESENSE_URL` into host/port/protocol), consumer `@EventPattern('search.index')` → `sync`, ack via manual ack like `AiJobsConsumer`, publisher like `AiJobsService.publish`, reindex script (DataSource + client directly, like `backfill-categories` script).
- [ ] **Step 4: Run** `pnpm vitest run && pnpm test:e2e` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): Typesense index for community courses, synced via search.index queue`

### Task 5: Community API

**Files:**
- Create: `packages/api/src/modules/community/community.controller.ts`, `dto.ts`
- Modify: `community.service.ts` (list, categories, detail, recommendations), `community.module.ts`, `docs/PROJECT_SPEC.md` §2.2 (strike "Public course catalog" with "approved 2026-11-22, see community design")
- Test: `test/community.e2e-spec.ts`

**Interfaces:**
- Produces HTTP (JWT): `GET /community/paths?q&category&tag&limit` → `{ items: CommunityPath[] }`; `GET /community/paths/:id` → `CommunityPathDetail`; `POST /community/paths/:id/copy` → `{ id }` 201/200; `GET /community/categories` → `{ id, name, count }[]`; `GET /community/recommendations?limit` → `CommunityPath[]`
- Produces types: `CommunityPath = { id; title; summary; category: { id; name } | null; tags: string[]; level: Level | null; moduleCount: number; lessonCount: number; copies: number; copiedPathId: string | null }`; `CommunityPathDetail = CommunityPath & { modules: { title: string; lessons: { title: string }[] }[] }`
- Consumes: `SearchIndexService.search/categoryFacets` (Task 4), `CommunityService.copy` (Task 3)

- [ ] **Step 1: Failing e2e** — list hydrates Typesense ids from Postgres in Typesense order; own visible paths excluded, own hidden original included; payload has no `userId`, `goal`, `conversationId` (assert with `JSON.stringify(body)` not containing the author's id/goal); `copiedPathId` set after copying; detail 404 for draft/copy; categories counts; recommendations: user with a "Lập trình" path gets other Lập trình courses first, excludes own and copied; user with no paths gets most-copied first; Typesense stopped (point the service at a bad URL via an override) → list 503 `SEARCH_UNAVAILABLE`; `q` > 100 chars → 400; `limit` 60 → 400.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** controller + DTOs (class-validator like existing DTOs), service methods; recommendations SQL: candidates `PUBLIC_PATH`, owner ≠ caller, not copied by caller; order by `count of caller's visible active paths in the same category` desc, copies desc, created_at desc.
- [ ] **Step 4: Run** `pnpm vitest run && pnpm test:e2e` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): community courses API`

### Task 6: App — Home suggestions, Community, course preview

**Files:**
- Create: `packages/app/src/lib/community-api.ts`, `src/components/community-cards.tsx`, `src/app/community/index.tsx`, `src/app/community/[id].tsx`
- Modify: `src/app/(tabs)/index.tsx` (suggestions rail), `src/app/_layout.tsx` (register stack screens if needed), `src/app/(tabs)/courses.tsx` (delete confirmation copy: active original → "Ẩn khỏi khoá học của bạn? Khoá học vẫn hiển thị trong Cộng đồng.", copy/draft → existing text)
- Modify: `PathSummary` type gains `isCopy: boolean` → backend `list()` returns `isCopy` (`source_path_id IS NOT NULL`) — add to Task 6 API change with its e2e assertion in `generate-path.e2e-spec.ts` list test.

**Interfaces:**
- Consumes: Task 5 endpoints and types (mirror them in `community-api.ts`)

- [ ] **Step 1:** API client + types; `isCopy` on `GET /learning-paths` (e2e assertion first, watch it fail, implement).
- [ ] **Step 2:** `CourseCard` (rail tile: typographic cover from category name initials, title, level · N bài) and `CourseRow` (list row with tags as pressable chips) in `community-cards.tsx`, styled with existing tokens (`bg-surface`, `border-line`, `text-ink`, `text-ink-muted`, `bg-tint`).
- [ ] **Step 3:** Home: "Gợi ý cho bạn" section under Continue using `useLoad(getRecommendations)` separately from the dashboard; hidden when empty or failed (no toast for it — pass a quiet loader); header "Xem tất cả" → `/community`.
- [ ] **Step 4:** `/community`: back header, search `TextInput` (debounce 300 ms), category chips from `/community/categories` (+ "Tất cả"), active tag chip with ✕, suggestions rail when no q/filter, results list, skeleton/empty ("Chưa có khoá học phù hợp.")/Retry states; tapping a tag sets the tag filter.
- [ ] **Step 5:** `/community/[id]`: details + modules/lessons, bottom button "Học khoá này" (copy → `router.replace('/paths/<id>')`, 409 `ALREADY_LEARNING` → open returned path) or "Tiếp tục học" when `copiedPathId`.
- [ ] **Step 6:** `npx tsc --noEmit && npx expo lint` — Expected: no new errors.
- [ ] **Step 7: Device check over adb** (dev server + Typesense running, `pnpm search:reindex` first): Home rail visible → Xem tất cả → search "nau an" → filter by a category chip → tap a tag → open a course → Học khoá này → lands on the copied path → open a lesson that already has content (instant) → back; delete an own active course from Courses → it disappears there and still shows in Community. Screenshot each step.
- [ ] **Step 8: Commit** `feat(app): community courses and home suggestions`
