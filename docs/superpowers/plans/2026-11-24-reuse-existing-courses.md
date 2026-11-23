# Reuse Existing Courses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before generating a new course, show the learner up to 3 matching public courses (same level, similar topic) they can copy instead.

**Architecture:** Typesense hybrid search (keyword + built-in `ts/multilingual-e5-small` embedding, fused by Typesense) on the existing community collection. A new endpoint returns matches for the open conversation's topic and level. The app checks for matches when the learner taps "Tạo lộ trình" and falls back to generation on no match or any error.

**Tech Stack:** NestJS + TypeORM, Typesense 29.0 (`typesense` npm client), vitest; Expo + expo-router + NativeWind (`@/tw`).

**Spec:** `docs/superpowers/specs/2026-11-24-reuse-existing-courses-design.md`

## Global Constraints

- All UI copy is Vietnamese.
- Embedding model: `ts/multilingual-e5-small`, embedding built from `title`, `summary`, `tags`.
- At most 3 matches. Matches are filtered to the conversation's `level`.
- Search failure must never block generation (app falls back to `generate()`).
- Reuse `POST /community/paths/:id/copy` (`copyCommunityPath`), including its `ALREADY_LEARNING` handling. No new copy endpoint.
- API formatting: prettier, width 120, single quotes, changed files only.

## Review Focus

1. Existing dev/prod collection without the `embedding` field: `ensureCollection` adds it, so hybrid search does not 400 after deploy. Test in Task 1.
2. A topic with no relevant public course (e.g. "Nấu phở" against SQL courses) must return `[]`, not the nearest unrelated course. The distance threshold is checked in Task 1.
3. Conversation not ready, closed, or someone else's → 409 `NOT_READY` / 409 `CONVERSATION_CLOSED` / 404, the same codes as `generate`. Tests in Task 2.
4. The caller's own visible course and drafts never come back as matches. Test in Task 2.
5. Typesense down → 503 `SEARCH_UNAVAILABLE`, and the app goes straight to generation. API test in Task 2, app behaviour in Task 3.

---

### Task 1: Hybrid `similar()` search in the index

**Files:**
- Modify: `packages/api/src/modules/search/search-index.service.ts` (schema, `ensureCollection`, new `similar`)
- Modify: `packages/api/README.md` (note: the first boot downloads the embedding model; existing collections get the field added automatically)
- Test: `packages/api/test/search-index.e2e-spec.ts`

**Interfaces:**
- Produces: `SearchIndexService.similar(params: { q: string; level: string; limit: number }): Promise<{ ids: string[] }>`

- [ ] **Step 1: Write the failing tests** in `search-index.e2e-spec.ts` (reuse its `makePath`-style setup and per-run collection):
  - `similar finds a paraphrased course at the same level`: public beginner path titled `SQL truy vấn để phân tích dữ liệu ${run}` with tags `['sql']`, synced. `similar({ q: 'học SQL để làm báo cáo số liệu', level: 'beginner', limit: 3 })` → `ids` contains it.
  - `similar filters by level`: the same query with `level: 'advanced'` → `ids` does not contain it.
  - `similar returns nothing for an unrelated topic`: `q: 'Nấu phở bò truyền thống'`, `level: 'beginner'` → `ids` does not contain it.
  - `ensureCollection adds the embedding field to an old collection`: create a collection under a second throwaway name with the schema **without** `embedding`, point a service at it, call `ensureCollection()`, then `retrieve()` the collection → `fields` contains `embedding`. Drop it afterwards.
- [ ] **Step 2: Run** `pnpm test:e2e test/search-index.e2e-spec.ts`. Expected: FAIL (`similar` is not a function).
- [ ] **Step 3: Implement.**
  - Add the schema field `{ name: 'embedding', type: 'float[]', embed: { from: ['title', 'summary', 'tags'], model_config: { model_name: 'ts/multilingual-e5-small' } } }`.
  - `ensureCollection`: on `ObjectAlreadyExists`, `retrieve()` the collection. If it has no `embedding` field, `update({ fields: [embeddingField] })`.
  - `similar` runs a `search` with:
    - `q`
    - `query_by: 'title,tags,summary,title_plain,tags_plain,embedding'`
    - `filter_by: level:=\`<level without backticks>\``
    - `vector_query: embedding:([], distance_threshold: ${MATCH_DISTANCE})`
    - `exclude_fields: 'embedding'`
    - `include_fields: 'id'`
    - `per_page: limit`
  - `MATCH_DISTANCE` is a module constant with a one-line comment saying it was tuned on the tests above. Start at `0.25` and adjust until all three `similar` tests pass. If keyword-only hits still let the unrelated test through, add `drop_tokens_threshold: 0`.
- [ ] **Step 4: Run** `pnpm test:e2e test/search-index.e2e-spec.ts test/community.e2e-spec.ts`. Expected: PASS (the existing list/search tests are unaffected).
- [ ] **Step 5: Commit** `feat(api): hybrid similar-course search in Typesense with a built-in embedding`

### Task 2: `GET /learning-paths/conversations/:id/matches`

**Files:**
- Modify: `packages/api/src/modules/community/community.service.ts` (new `matches`)
- Modify: `packages/api/src/modules/learning-paths/conversations.controller.ts` (new route)
- Modify: `packages/api/src/modules/learning-paths/learning-paths.module.ts` (import `CommunityModule`)
- Test: `packages/api/test/community.e2e-spec.ts`

**Interfaces:**
- Consumes: `SearchIndexService.similar` (Task 1)
- Produces:
  - `CommunityService.matches(userId: string, q: { topic: string; level: string }): Promise<CommunityPath[]>`, at most 3 results, in Typesense order
  - HTTP `GET /learning-paths/conversations/:id/matches` → `CommunityPath[]`

- [ ] **Step 1: Write the failing tests** in `community.e2e-spec.ts`. Add a helper that opens a conversation for a user and sets `preferences` and `ready` directly in the DB, the same way `shared-generation.e2e-spec.ts:94` does. Then:
  - `matches returns similar public courses for a ready conversation`: user `c` with a conversation `{ topic: 'Lập trình một', level: 'beginner' }` (the `l1` title) → 200, ids include `p.l1`, length ≤ 3, and `anonymous(body)` holds.
  - `matches never returns the caller's own visible course or drafts`: user `a` with the same conversation → ids exclude `p.l1`, `p.l2` and `p.draft`.
  - `matches is 409 NOT_READY before the brief is complete`: `ready: false` → 409 `NOT_READY`.
  - `matches is 404 on someone else's conversation`.
  - `matches is 503 SEARCH_UNAVAILABLE when Typesense is down`: via the existing `down` app.
- [ ] **Step 2: Run** `pnpm test:e2e test/community.e2e-spec.ts`. Expected: FAIL (404 on the route).
- [ ] **Step 3: Implement.**
  - `matches`: `this.searching(() => this.search.similar({ q: topic, level, limit: 3 + n }))`. `n` is the caller's own public count, the same as in `list`. Then run the same Postgres fill as `list`: `PUBLIC_PATH AND NOT_OWN_VISIBLE`, `array_position` order, `LIMIT 3`.
  - Route: `@Get(':id/matches')`.
    - Call `getOpenForUser`, then throw the same `NOT_READY` 409 as `generate` when the conversation is not ready.
    - Return `community.matches(user.id, { topic, level })`.
    - Add Swagger decorators in the style of `generate`, with 503 `SEARCH_UNAVAILABLE`.
- [ ] **Step 4: Run** `pnpm test:e2e test/community.e2e-spec.ts test/conversations.e2e-spec.ts` and `npx tsc --noEmit -p .`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): matching public courses for a ready conversation`

### Task 3: App — offer matches before generating

**Files:**
- Modify: `packages/app/src/lib/learning-paths-api.ts` (new `getMatches`)
- Modify: `packages/app/src/app/new-path.tsx`

**Interfaces:**
- Consumes: `GET /learning-paths/conversations/:id/matches` (Task 2); `copyCommunityPath`, `CommunityPath` from `@/lib/community-api`; `CourseRow` or `CourseCard` from `@/components/community-cards`; the existing `startConversation`
- Produces: `getMatches(conversationId: string): Promise<CommunityPath[]>`

- [ ] **Step 1: Add `getMatches`** using `authFetch`, following the other helpers in `learning-paths-api.ts`.
- [ ] **Step 2: Add the step `'matches'`** to `type Step`, plus a `matches: CommunityPath[]` state.
  - "Tạo lộ trình" now calls `offer()`: `getMatches(conversationId)`. If the list is non-empty, show the `'matches'` step. If it is empty **or the call throws**, run `generate()` unchanged.
- [ ] **Step 3: Render the `'matches'` step.**
  - Header text: "Đã có khoá học tương tự".
  - One `CourseCard` per course. Below each card, a button labelled "Học khoá này", or "Mở khoá học" when `copiedPathId` is set.
  - Bottom: a `PrimaryButton` "Vẫn tạo khoá mới" that runs `generate()`, and a back control that runs `backToChat`.
- [ ] **Step 4: Handle "Học khoá này".**
  - When `copiedPathId` is set, use that id. Otherwise call `copyCommunityPath(id)`.
  - Then `await startConversation()` (closes the old chat; ignore a failure here).
  - Then `router.replace(\`/paths/${pathId}\`)`.
  - On a copy error, show it with the existing `setError(toFailure(e))`.
- [ ] **Step 5: Fix the leftover placeholder** `'Chủ đề, trình độ và mục tiêu của bạn…'` → `'Chủ đề và trình độ của bạn…'` (the goal was removed from the chat).
- [ ] **Step 6: Verify.** Run `pnpm -C packages/app tsc --noEmit` (or the app's typecheck script) and the app linter. Then, with the API running, check on a device or simulator:
  - (a) a topic matching a public course shows the list; "Học khoá này" opens the copied course, and returning to "Tạo khoá học" shows a fresh greeting;
  - (b) an unrelated topic goes straight to generation;
  - (c) with Typesense stopped, the app goes straight to generation.
- [ ] **Step 7: Commit** `feat(app): offer matching community courses before generating a new one`
