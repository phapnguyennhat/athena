---
version: 1
slug: "src-app-onboarding-account-tsx"
primary_target: "src/app/(onboarding)/account.tsx"
related_targets: []
---

# Account (sign-up / sign-in / verify)

Mode: Operate. Platform adaptive (HIG on iOS, Material on Android). Vietnamese copy only.

Job: a visitor from Welcome creates an account or signs in with email + password against Athena's API, verifies email with a 6-digit code, then enters the app. No third-party providers. No password reset in this surface.

Audience: first-time or returning self-learners on a phone, coming from the onboarding demo with intent to start.

Flow: Welcome → Account (`mode=sign-up|sign-in`) → (sign-up: Email → Hồ sơ → Xác minh) or (sign-in → app; unverified → Xác minh) → app tabs.

States: field validation; submitting/loading; API errors with retry; email conflict; wrong credentials; invalid/expired code; resend code (1/min); keyboard open; long Vietnamese labels; both appearances; large Dynamic Type; Reduce Motion (marks fill without slide).

Constraints: inherit Welcome world (near-black / off-white, #FF4D3D accent, system faces, lesson-style state marks). Timezone from device. Password reset out of scope.

## Direction contract

THESIS: Auth advances like a lesson — state marks track the path while the form is the only work area. Refuses a single endless scroll of every sign-up field at once.

OWN-WORLD: Same Athena shell as Welcome: canvas ground, raised #18181C / white surfaces with #2A2A30 / #E2E2DE hairlines, white or near-black ink, one red-orange accent (#FF4D3D) for CTA and active marks. System faces; heavy display weight on the step headline. Lesson marks (filled / half / hollow) are the signature, never colour alone for progress.

STORY: The visitor knows which step they are on, trusts that Athena already feels like the demo cards, completes email → profile → verify (or signs in), and lands in the app ready to create a path.

FIRST VIEWPORT: Top: back + BrandMark. Below: horizontal lesson marks (3 for sign-up; collapsed or hidden for single-step sign-in) with quiet "Bước n / 3 · …" label. Heavy step headline + one body line. Stacked fields in the work area (current step only). Sticky bottom: filled accent primary CTA; text link to switch mode. Signature interaction: advancing a step fills the next mark the way lesson state marks fill on Welcome; verify swaps the work area for six OTP cells without leaving the screen.

FORM: Dấu tiến độ (surface structure 5 of 7 on the grounded list; seed:4d551f7f1aa77bcf).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
