---
version: 1
slug: "src-app-onboarding-welcome-tsx"
primary_target: "src/app/(onboarding)/welcome.tsx"
related_targets: []
---

# Onboarding (intro demo + sign-in)

Mode: Operate. Platform adaptive (HIG on iOS, Material on Android). Vietnamese copy only.

Job: a first-launch visitor sees how Athena works (path → lesson → quiz → streak) in a short demo, then must sign in before using the app. Onboarding has no inputs: no topic, level or goal questions (those belong to the Create-path flow after sign-in). Demo content is illustrative and labelled as such; no invented learner counts, testimonials or outcome promises.

Flow: Onboarding (4 swipeable demo cards, sign-in always visible) → Đăng nhập or Tạo tài khoản (email + password against Athena's own API; no third-party providers) → app. Returning signed-in users never see it.

States: skip straight to sign-in at any card; sign-in loading/failure with retry; offline; long Vietnamese copy wraps without clipping tone marks; both appearances; large Dynamic Type / font scale; Reduce Motion (cards change without slide).

Open: password reset flow; email verification at sign-up or later.

## Direction contract

THESIS: Show the loop with real UI, then ask for sign-in once. Refuses the category's illustration carousel that hides sign-in behind the last slide.

OWN-WORLD: Near-black ground (#0E0E10), raised surfaces #18181C/#1C1C20 with #2A2A30 hairlines, white type, one red-orange accent (#FF4D3D) for the primary action, progress and state marks. System faces (SF / Roboto), heavy display weight (900) against quiet 15–16 body. Lesson state as fixed-cell marks (filled, half, hollow), never colour alone. Streak flame uses the accent.

STORY: The visitor understands Athena builds a path for their goal, teaches in short lessons with a quiz, and tracks a daily streak; believes it is concrete because the cards are the real UI; signs in.

FIRST VIEWPORT: Top bar: "Athena" left, step count "1 / 4" right. Upper half: horizontally swipeable demo card (310pt wide, next card peeking) — card 1 "Lộ trình soạn riêng" with three modules and their state marks; cards 2–4: lesson, quiz with explanation, streak. Page dots under the deck (active dot is an accent pill). Below: one heavy headline per card ("Nói mục tiêu, nhận lộ trình.") and one body line. Bottom, always visible: filled accent "Tạo tài khoản", then text button "Đã có tài khoản? Đăng nhập". Signature interaction: the headline and step count follow the card under the finger; the demo cards are built from the same components the real screens use.

FORM: Demo trên, đăng nhập dưới (surface structure 6 of 7 on the grounded list; world from the vertical-feed challenger palette, catalog pop-culture-shelf-vertical-video-feed-surface); seed:a0b316c65f26e822.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
