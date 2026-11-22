# Course categories — design

## Intent
Every learning path (course) gets a category and search tags when it is created, so the upcoming community
page can filter by category and search by tag. The community page itself is out of scope here.

## Goals / non-goals
- Goal: each new path has exactly one Vietnamese category and 1–5 Vietnamese tags, assigned by the LLM.
- Goal: the LLM reuses an existing category; it creates a new one only when none fits.
- Non-goal: community listing, search/filter endpoints, app UI, admin tooling to merge categories.
- Anti-goal: category sprawl (near-duplicates like "Lập trình" / "lập trình") — prevented by slug matching.

## Approaches (picked: A)
- **A. `categories` table + FK on paths** — picked. Rename/merge/icons/counts later touch one row, not every path.
- B. Plain `category` text column on paths — smaller now, but merging duplicates rewrites every path.
- Rejected: a separate classify LLM call — extra cost and latency; the existing generate call can return it.

## Design
- **Migration**: `categories(id uuid, slug varchar UNIQUE, name varchar, created_at)`, seeded with ~15
  Vietnamese categories incl. "Khác". `learning_paths.category_id uuid NULL FK → categories ON DELETE SET NULL`,
  `learning_paths.tags text[] NOT NULL DEFAULT '{}'` with a GIN index. Existing paths start with
  `category_id NULL`; the backfill below fills active ones.
- **AI call**: `PathAi.generate(prefs, categories: string[])` — `GeneratePathHandler` loads category names and
  passes them in. `GENERATE_SYSTEM` tells the model to pick one of them verbatim, or write a new short
  Vietnamese category only if none fits, plus 1–5 lowercase Vietnamese tags. `PATH_SCHEMA` gains
  `category: str(60)`, `tags: string[] (maxItems 5, str(40))`.
- **Validation** (`validatePathOutput`): category trimmed, empty/invalid → "Khác"; tags trimmed, lowercased,
  deduped, empties dropped. A bad category never fails the path (same as `language`).
- **Matching**: `slug = lowercase, strip Vietnamese diacritics (đ→d), non-alnum → "-"`. Handler, inside the
  existing transaction: `INSERT … ON CONFLICT (slug) DO NOTHING`, then select by slug → `category_id`.
- **Backfill**: `PathAi.categorize({title, summary, moduleTitles}, categories)` → `{category, tags}` (small
  Gemini call, same validation + slug matching as generate). A one-off script
  `src/scripts/backfill-categories.ts` (Nest application context, `npm run backfill:categories`) loops over
  `status='active' AND category_id IS NULL` paths one at a time; re-runnable, a failed path is logged and
  skipped. Drafts are not backfilled — they are replaced on regenerate or get categorized when generated anew.
- **API**: path detail and list views include `category: { id, name } | null` and `tags`.
- **Tests**: slug function, validator fallbacks, handler creates vs reuses a category.

## Calls I made (correct me)
- Courses are Vietnamese only, so categories and tags are Vietnamese; no per-language handling.
- Local DB cleanup done 2026-11-22: deleted 78 paths owned by `@example.com` e2e users (made by `FakePathAi`,
  not the LLM). Remaining: 1 active, 1 draft. E2E tests write to the same local DB and will recreate such rows.
- Seed list content is the builder's call (~15 broad subjects + "Khác").
