# Path extension ("Học tiếp") — design

## Intent
Courses become comprehensive by growing: when a learner is about to finish, the AI writes the next chapters. The
original course and every copy of it (one "family") receive the same new chapters, and each extension costs one LLM
call no matter how many learners trigger it. Learners are told up front that the AI keeps adding chapters.

Approved by the owner 2026-11-23 (approach 1: append to every family path; not a shared outline refactor).

## Rules
- **Family**: root = `coalesce(source_path_id, id)`; members = root + paths with `source_path_id = root`. Active
  outlines are never edited, so members' outlines are identical and new chapters are appended at the same positions.
- **Trigger**: after a lesson is completed (`LessonsService.complete`), if the learner has ≤ 2 uncompleted lessons
  in that path, the root is not `outline_complete`, and the path has < 20 modules → enqueue `extend_path` with
  `{ rootId, afterModules }` (current module count). Best effort: never fails the completion.
- **One LLM call per extension**:
  - Partial unique index: one queued/running `extend_path` job per `rootId`.
  - Handler is a no-op (no model call) when the root already has more than `afterModules` modules or is complete.
  - The write re-checks under `FOR UPDATE` on the root row; `copy()` reads its source `FOR SHARE`, so a copy made
    during an extension gets either the old or the new outline, never half.
- **Model**: input = title, level, language, existing modules with lesson titles. Output `{ complete, modules }` with
  0–3 next modules (2–6 lessons each, same lesson-title rules as path generation). `complete = true` (or reaching 20
  modules) sets `learning_paths.outline_complete` on the root; no more extensions.
- **Write**: one `lesson_contents` row per new lesson, shared by every member's new lesson (content generated once,
  as for copies). Search index: publish the root (`lesson_count` changed).
- **Visible state** (`LearningPathView.extension`): `complete` (root outline_complete) · `generating` (an active
  extend job for the root) · `idle`. Path detail shows, for active paths:
  - idle: "Tiếp tục học để mở khoá các chương tiếp theo."
  - generating: "AI đang soạn chương tiếp theo…"
  - complete: "Khoá học đã hoàn chỉnh."

## Non-goals
Manual "generate more" button; notifying other family members (they see new chapters on next load); editing or
reordering extended chapters; resizing the initial outline (still 3–8 modules).
