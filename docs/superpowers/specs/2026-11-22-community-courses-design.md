# Community courses — design

## Intent
Self-learners should be able to explore any course other people built and start learning it themselves without
limit. Every active course becomes browsable in a Community page (search, category and tag filters, suggestions),
and Home shows a suggestions section. Taking a course copies it into the learner's own courses. Generated lesson
content is shared by every copy, so the LLM is called once per lesson no matter how many people learn it.

Builds on: `docs/superpowers/specs/2026-11-22-course-categories-design.md` (categories, tags).
Scope change: `docs/PROJECT_SPEC.md` §2.2 lists "Public course catalog" out of MVP; the owner approved it
2026-11-22 — update that line.

## Goals
- Community page reachable from Home (not a tab): search (title + tags, accent-insensitive), filter by category or
  tag, suggestions, results list. Keyword search runs on Typesense, indexed asynchronously. Tap → read-only outline → "Học khoá này" copies it and opens the copy.
- Home: "Gợi ý cho bạn" section with a "Xem tất cả" link to Community.
- All active original courses are public automatically and anonymous. An owner "deleting" an active course only
  hides it from themselves; it stays public.
- A lesson's content, videos and quiz are generated at most once across the original and all its copies, including
  when two learners open the same ungenerated lesson at the same moment.

## Non-goals
- Opt-out / unshare toggle, author profiles, likes, ratings, comments, following.
- Editing a copy's outline. Syncing later changes of the original into copies (outlines of active paths can't
  change today anyway).
- Moderation/approval of courses or model-made categories.
- Pagination beyond a fixed page size (see shortcut below).

## Anti-goals
- Leaking who made a course: no author name/email/id, no `preferences.goal` (the learner's personal goal) in any
  community response.
- One course listed N times because N people copied it.
- Two LLM calls for the same lesson or quiz.
- Losing a learner's lessons/progress when the original's owner deletes their course.
- Making users wait for search indexing (indexing is asynchronous).

## Approaches (picked: B)
- A. Lesson "families" (`origin_lesson_id`) + DB lock held during generation; content copied row to row. Smaller,
  but duplicates content rows and holds a connection per in-flight generation.
- **B. Shared content table — picked by the owner.** Content is stored once in `lesson_contents`; every lesson
  (original and copies) points at it. Bigger refactor of lesson/video/quiz reads, cleaner server: one row per
  lesson's content, no copying of generated data.
- C. Copy content at copy time only — rejected: lessons not yet generated when copied would be generated twice.

## Design (backend, packages/api)

### Data model (one migration)
- `lesson_contents(id uuid PK, content jsonb NULL, search_keywords jsonb NULL, generated_at timestamptz NULL,
  generating_since timestamptz NULL, quiz_generating_since timestamptz NULL, created_at)`.
- `path_lessons.content_id uuid NOT NULL FK → lesson_contents ON DELETE RESTRICT`, indexed. Drop
  `path_lessons.content`, `search_keywords`, `content_generated_at`.
- `lesson_resources.lesson_id` → `content_id` (FK → lesson_contents ON DELETE CASCADE).
- `quizzes.lesson_id` → `content_id` (unique, FK → lesson_contents ON DELETE CASCADE). `quiz_attempts` keep
  `quiz_id` + `user_id` (attempts stay per learner).
- `learning_paths.source_path_id uuid NULL` (FK → learning_paths ON DELETE SET NULL), indexed; set on copies.
- `learning_paths.hidden_at timestamptz NULL` — set when the owner "deletes" an active course (see Deleting).
- **Data move:** one `lesson_contents` row per existing lesson **with the same id as the lesson**, carrying its
  content/keywords/generated_at; then `content_id = id`. Because ids match, resources and quizzes are repointed by
  renaming the column and swapping the FK — no row rewrites. `down` reverses it (copies would make `down` lossy;
  acceptable before release, note it in the migration).

### Lesson creation and copy
- `insertModules` creates one `lesson_contents` row per new lesson (empty) and sets `content_id`.
- Copy (`POST /community/paths/:id/copy`), one transaction:
  - Source must be `status='active' AND source_path_id IS NULL` and not owned by the caller, else 404.
  - Idempotent: if the caller already has a path with `source_path_id = :id`, return it (200) instead of a second copy.
  - New path: `status='active'`, `source_path_id`, title, summary, `category_id`, `tags`, `content_language`,
    `preferences = { topic, level }` (**goal dropped** — private), `conversation_id NULL`.
  - Modules and lessons copied by position; each lesson reuses the source lesson's `content_id`.
  - Response: `{ id }` of the learner's path. Progress starts empty.

### Generation once per content row
- Jobs stay per user and per lesson (`generate_lesson` / `generate_quiz` with `{ lessonId }`); the app flow, job
  views and sockets are unchanged. The handler resolves the lesson's `content_id` and works on that row.
- Claim: `UPDATE lesson_contents SET generating_since = now() WHERE id = $1 AND content IS NULL AND
  (generating_since IS NULL OR generating_since < now() - interval '3 minutes') RETURNING id`.
  - Claimed → call the model (outside any transaction, as today) → in a transaction write content, keywords,
    `generated_at`, clear `generating_since`, insert resources. On model failure clear `generating_since` so a
    retry/other learner can claim.
  - Not claimed and `content IS NULL` → someone else is generating: poll the row every 1 s; when content appears,
    succeed with the lesson id; if the claim goes stale (3 min) try to claim it; give up after 4 min with
    `JobError('LESSON_BUSY')` (app shows the existing failed+retry state).
  - Content already present → succeed immediately (no model call).
- Quiz: same pattern on `quiz_generating_since`; the existing unique `quizzes.content_id` + `orIgnore` stays as a
  last guard.
- Prompt context comes from the requesting learner's own path (title, level, neighbours) — identical structure to
  the original, so shared content stays coherent.
- **Goal no longer reaches lessons (owner, 2026-11-22):** `generate-lesson.handler.ts` stops passing
  `preferences.goal`; lesson prompts use topic, level and outline only, for every path. Path title/summary/tags still
  use the goal (they are generated once, by the author). Already generated lessons are not rewritten.
- shortcut: a job waiting on another learner's generation holds one of the worker's 4 prefetch slots for up to
  4 min; fine while simultaneous opens of the same ungenerated lesson are rare — upgrade to "loser re-queues itself
  with a delay" if `LESSON_BUSY`/slow AI jobs show up.
- Reads (`LessonsService.view`, `QuizzesService`, quiz ownership check) go through `content_id`. Ownership is still
  checked through the learner's own lesson → module → path. `quiz.submit(quizId)` must verify the caller owns *a*
  lesson whose `content_id` is the quiz's `content_id`.

### Deleting a course (owner, 2026-11-22: "just hidden from that user, still public")
- **Active original** (`source_path_id IS NULL`): `DELETE /learning-paths/:id` sets `hidden_at = now()` instead of
  deleting. It disappears from the owner's Courses, Home (dashboard, continue, totals stay as computed today) and
  recommendations; it stays public in Community with its content. Progress rows are kept.
  - The owner still sees it in Community (it is not excluded as "own" while hidden); "Học khoá này" on it clears
    `hidden_at` and opens it with the old progress — no copy is made.
- **Copy** (`source_path_id IS NOT NULL`) and **draft**: deleted for real as today (cascade modules/lessons/progress),
  then `lesson_contents` rows no lesson references any more are deleted in the same transaction. A copy is never
  public, so nothing is lost for others.
- Hidden paths: every owner-facing read (`get`, `list`, dashboard/continue, lesson ownership) treats them as not
  found, except the un-hide via copy.
- Originals are therefore never removed by their owner; no copy promotion needed. `source_path_id` FK stays
  `ON DELETE SET NULL` as a backstop (account purge).
- Copy guard: refuse (409 `ALREADY_LEARNING`, with the existing path id) when the caller already owns a visible
  lesson whose `content_id` is in the source's lessons — a learner never has two lessons on one content row.
- Courses of soft-deleted accounts stay public and copyable (owner, 2026-11-23) — same rule as deleting a course.

### Search index (Typesense, owner's choice)
- New docker-compose service `typesense` (pinned `typesense/typesense:<version>`, API key from env); env vars
  `TYPESENSE_URL`, `TYPESENSE_API_KEY` validated in `env.validation.ts`; client: the official `typesense` npm package.
- Collection `community_paths`, one document per **public** path (active, original):
  `id, title, summary, tags[] (facet), category_id (facet), category_name, level (facet), lesson_count, copies
  (int, sort), created_at (int, sort)`. No author, no goal. Search fields `title, tags, summary` (weighted in that
  order); Typesense's typo tolerance and diacritic handling cover "nau an" → "Nấu ăn" (verify in a test).
- **Indexing is asynchronous**: a dedicated RabbitMQ queue `search.index` (separate from `ai.jobs`, durable, own
  DLQ) carries `{ pathId }`. Its consumer reads the path from Postgres and **upserts** the document if the path is
  public, otherwise **deletes** it — idempotent and order-independent, so duplicate/late messages are harmless.
  Published after the DB commit on: path activated (`start`), category/tags set (generation, backfill), copy made
  (source's `copies` changed). Hiding does not change
  public state, so no message.
- Losing a message (broker down at publish) leaves the index stale; `pnpm search:reindex` rebuilds the collection
  from Postgres (also used for first deploy). shortcut: no automatic sweeper; add one if staleness shows up.
- Postgres stays the source of truth; Typesense only answers list/search queries.
### Community API (JWT, same guard as other routes)
Every response is anonymous: never `userId`, author, `conversationId`, `preferences.goal`.
- `GET /community/paths?q=&category=&tag=&limit=` → `{ items: CommunityPath[] }`, answered by Typesense:
  - `q` (trimmed, ≤100 chars, `*` when empty), `filter_by` category id / exact tag, `sort_by` copies desc then
    created_at desc. `limit` default 20, max 50. The caller's own **visible** paths are filtered out after the
    query (ids from Postgres), and `copiedPathId` is filled from Postgres.
  - Typesense unreachable → 503 `SEARCH_UNAVAILABLE` (app: toast + Retry). No Postgres fallback.
  - shortcut: no cursor; use Typesense `page` when results regularly exceed 50.
- `CommunityPath = { id, title, summary, category: {id,name}|null, tags, level, moduleCount, lessonCount, copies,
  copiedPathId: string|null }` (`copiedPathId` = the caller's copy, so the UI can show "Tiếp tục học").
- `GET /community/paths/:id` → `CommunityPath & { modules: { title, lessons: { title }[] }[] }`; 404 for non-public.
- `POST /community/paths/:id/copy` → `{ id }` (201 new, 200 existing).
- `GET /community/categories` → `{ id, name, count }[]` from the Typesense `category_id` facet, count desc.
- `GET /community/recommendations?limit=` (default 10, max 20) → `CommunityPath[]`:
  - Postgres query. Candidates: public paths not owned (visible) and not already copied by the caller.
  - Score: in a category of the caller's own active paths first (weight by how many of their paths are in it),
    then copies desc, then newest. A user with no paths gets most-copied/newest.

## Design (app, packages/app)
- **Home** (`(tabs)/index.tsx`): below Continue, a "Gợi ý cho bạn" section — horizontal rail of course cards (reuse
  the removed `CommunityRail` look from `fa0e6c7`: typographic cover from the category, title, level, lesson count),
  header link "Xem tất cả" → `/community`. Hidden when there are no recommendations. Loads independently of the
  dashboard (its failure must not break Home).
- **Community** `/community` (stack screen with back button, not a tab):
  ```
  ← Cộng đồng
  [ 🔍 Tìm khoá học…            ]
  (Tất cả) (Lập trình) (Ngoại ngữ) (Ẩm thực) …   ← category chips, horizontal
  #sql ✕                                         ← active tag filter, if any
  Gợi ý cho bạn                                  ← only with no search/filter
  [card][card][card] →
  Khoá học                                       ← results
  SQL căn bản cho phân tích dữ liệu
  Dữ liệu & AI · Cơ bản · 12 bài · 5 người học
  #sql #phân tích dữ liệu …                      ← tapping a tag sets the tag filter
  ```
  Search is debounced (~300 ms); empty, loading (skeleton), error (Retry) states like Courses.
- **Course preview** `/community/[id]`: title, category, level, lesson count, copies, tags, summary, modules with
  lesson titles (no progress), bottom button "Học khoá này" → copy → `router.replace('/paths/<newId>')`; if
  `copiedPathId` is set the button reads "Tiếp tục học" and opens that path.
- All copy in Vietnamese; API errors via the existing toast.
- `PathRow`/`LearningPathView` unchanged; a copied course behaves exactly like the learner's own.

## Tests that must exist
- Migration: existing lesson content, resources and quizzes are readable through `content_id` after up; revert works
  on a DB without copies.
- Copy: anonymous fields, goal dropped, content shared, idempotent second copy, can't copy own/draft/copy-of-copy.
- Generation: two concurrent jobs for two learners' lessons on one content row → exactly one model call, both jobs
  succeed; stale claim is taken over; model failure releases the claim. Same for quiz.
- Delete: deleting an active original only hides it (still listed, content intact, owner can resume via "Học khoá
  này" with old progress); deleting a copy or draft removes it and unreferenced content rows.
  A deleted account's courses stay listed.
- Search index: consumer upserts public / deletes non-public docs; duplicate messages harmless; reindex script
  rebuilds; accent-insensitive search works against a real Typesense (e2e, docker-compose service).
- Copy guard: copying a course whose content the caller already learns → 409 `ALREADY_LEARNING`.
- Lesson prompt input has no `goal`.
- Community list/search: category/tag filters, excludes own visible paths, drafts and copies, no author/goal in
  payload, 503 when Typesense is down. Recommendations: category-match ordering, excludes own and already copied.
- App: tsc + lint clean; device walk-through over adb (Home rail → Community → filter → preview → learn → lesson).

## Calls I made (correct me)
- Copies drop the original's `goal` (privacy). Lesson prompts no longer use the goal for anyone (owner's choice).
- Hidden original reappears for its owner in Community; "Học khoá này" restores it with old progress.
- Indexing via its own RabbitMQ queue (not `ai.jobs`), reindex script instead of a sweeper.
- No opt-out toggle (owner: "public automatically").
- Waiting job gives up after 4 min (`LESSON_BUSY`), stale claim after 3 min.
- Fixed page size 50, no cursor yet.

## Left to the builder
- Card visuals beyond the sketch, chip styling, skeletons (follow existing components and tokens).
- Exact SQL shape of recommendations and list queries; indexes beyond those named.
- Splitting the work into tasks and commits.
