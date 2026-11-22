# Athena --- AI Learning Companion

## Project Specification for Coding Agent

**Document purpose:** Product and MVP specification for planning and
implementation.\
**Working product name:** Athena (name is provisional; verify app-store,
domain, and trademark availability before public launch).\
**Product type:** Personal learning mobile application powered by AI.\
**Primary goal:** Help an individual turn a learning goal into a
structured, actionable learning journey, then stay consistent through
lessons, quizzes, progress tracking, and daily streaks.

------------------------------------------------------------------------

# 1. Product Overview

Athena is a personal AI learning companion. A user enters a topic they
want to learn, provides a little context about their current level and
learning goal, and AI generates a structured learning path.

Each learning path is divided into modules and lessons. A lesson
contains concise theory, examples or key takeaways, and relevant
external learning resources such as YouTube videos. The user can take a
quiz to check understanding and mark the lesson as completed.

The app tracks learning progress and daily activity. A streak encourages
users to return and build a sustainable learning habit.

## 1.1 Problem

People who want to learn independently often face several problems:

-   They do not know where to start or what topics to learn first.
-   Learning materials are scattered across articles, videos, and
    courses.
-   It is difficult to measure progress when learning without a formal
    course.
-   Reading alone does not reliably reveal whether a concept has been
    understood.
-   Motivation drops when there is no visible progress or learning
    routine.

## 1.2 Product approach

Athena addresses these problems by:

1.  Generating a structured learning path from a user's goal.
2.  Generating lesson content on demand instead of generating an entire
    course upfront.
3.  Providing relevant external resources for further study.
4.  Generating quizzes based on lesson content.
5.  Tracking completed lessons and learning activity.
6.  Showing a daily streak and progress summary.

## 1.3 Product principles

-   **User-owned learning:** Users create and own their learning paths.
    Admins do not need to upload courses for the MVP.
-   **AI-assisted, not AI-controlled:** AI proposes content and
    structure; users can review and edit their learning paths.
-   **Progressive generation:** Generate lesson content and quizzes when
    needed to control latency and AI costs.
-   **Grounded learning:** Quiz questions should be answerable from the
    associated lesson content. Avoid unsupported claims and fabricated
    resources.
-   **Simple habit loop:** Make it easy to resume learning and see
    progress.
-   **MVP first:** Avoid social, marketplace, and complex gamification
    features until the core learning loop is validated.

------------------------------------------------------------------------

# 2. Goals and Non-Goals

## 2.1 MVP goals

A user should be able to:

-   Sign in and manage their account.
-   Create a learning path by entering a topic and learning preferences.
-   Receive an AI-generated path containing modules and lessons.
-   View a lesson and generate its theory/content when needed.
-   Open relevant YouTube resources or other external links.
-   Generate and complete a quiz for a lesson.
-   See quiz results and explanations.
-   Mark a lesson as completed.
-   View learning path progress.
-   Maintain and view a daily learning streak.
-   Return to the most recently active learning path or lesson.

## 2.2 Explicitly out of scope for MVP

Do not implement these unless the project owner approves a scope change:

-   Admin-managed course authoring or an admin content-upload portal.
-   ~~Public course catalog or course marketplace.~~ Approved 2026-11-22, see community design (`docs/superpowers/specs/2026-11-22-community-courses-design.md`).
-   Social feed, following, comments, or direct messaging.
-   Leaderboards and competitive rankings.
-   Paid subscriptions, payments, or in-app purchases.
-   AI chat tutor with open-ended conversation.
-   Live classes or video hosting.
-   User-uploaded video hosting.
-   Complex badges, achievements, or rewards.
-   Collaborative learning paths.
-   Offline synchronization.
-   Spaced repetition scheduling, unless it can be added without
    delaying the core MVP.
-   Multi-language content generation beyond the language support
    explicitly selected for the MVP.

------------------------------------------------------------------------

# 3. Target User and Main Use Case

## 3.1 Target user

An individual who wants to learn a subject independently and needs help
organizing the learning process and staying consistent.

Example subjects:

-   Backend Development with Java Spring Boot
-   TypeScript
-   Database Design
-   English Grammar
-   Machine Learning Fundamentals
-   Personal Finance Basics

## 3.2 Example scenario

A user wants to learn Java Spring Boot.

1.  The user creates a learning path with the topic "Java Spring Boot".
2.  The user selects their current level as Beginner.
3.  The user describes the goal: "Build REST APIs with authentication
    and PostgreSQL."
4.  The user selects an available study schedule, for example 5 hours
    per week.
5.  AI creates a roadmap with modules and ordered lessons.
6.  The user opens the first lesson.
7.  The app generates lesson theory and relevant learning resources.
8.  The user studies the content and optionally watches a linked video.
9.  The user takes a quiz.
10. The user reviews the result and explanations.
11. The user marks the lesson as completed.
12. The app updates progress and daily activity.
13. The user returns later and resumes the next lesson.

------------------------------------------------------------------------

# 4. Core User Flows

## 4.1 Create a learning path

1.  User opens the create-learning-path screen.
2.  User enters:
    -   Topic or subject (required).
    -   Current knowledge level (required; suggested values: Beginner,
        Intermediate, Advanced).
    -   Learning goal (optional but recommended).
    -   Available study time (optional; e.g. hours per week).
    -   Preferred content language (optional; use app default if
        omitted).
3.  User submits the form.
4.  Backend validates the input and creates a learning-path generation
    job or request.
5.  AI returns structured modules and lessons.
6.  Backend validates the AI output against a schema and business rules.
7.  Backend persists the path, modules, and lessons.
8.  User sees the generated learning path.
9.  User can review and edit the path before starting, if editing is
    included in the first release.

**Important:** Do not persist unvalidated model output directly into the
database. Use structured output or JSON Schema and validate again on the
backend.

## 4.2 Open and study a lesson

1.  User opens a lesson from a learning path.
2.  Backend checks whether lesson content has already been generated.
3.  If content exists, return the stored content.
4.  If content does not exist, generate it using the lesson title,
    description, learning-path context, and preceding/following topics
    as appropriate.
5.  Validate and persist the generated content.
6.  Display the lesson.
7.  Display relevant external resources when available.
8.  Allow the user to take the lesson quiz and mark the lesson as
    completed.

Lesson generation should be idempotent or protected against duplicate
concurrent generation requests. Two requests for the same lesson should
not create conflicting content or duplicate records.

## 4.3 Take a quiz

1.  User selects "Take quiz" from a lesson.
2.  Backend returns an existing quiz or generates one if none exists.
3.  User answers the questions.
4.  User submits the attempt.
5.  Backend evaluates answers using the stored answer key, not a new AI
    request.
6.  Backend stores the attempt, score, and submitted answers.
7.  User sees the score and explanations.
8.  User can retry the quiz if retries are allowed.

Do not send correct answers to the client before the user submits the
quiz. Keep answer keys server-side until grading is complete.

## 4.4 Complete a lesson

1.  User selects "Mark as completed".
2.  Backend verifies that the lesson belongs to a learning path
    accessible to the user.
3.  Backend creates or updates the user's lesson progress.
4.  Recalculate learning-path progress.
5.  Record qualifying daily learning activity.
6.  Recalculate or update the user's streak.
7.  Return updated progress and streak information.

Define whether a lesson can be marked complete without taking a quiz.
Recommended MVP behavior: yes. Quiz completion and lesson completion are
separate states.

## 4.5 Resume learning

The dashboard should provide a clear "Continue learning" action based on
the user's most recently active, incomplete lesson. If no active lesson
exists, show the user's learning paths and a useful next action.

------------------------------------------------------------------------

# 5. Functional Requirements

## 5.1 Authentication and user profile

MVP requirements:

-   Users can register and sign in.
-   Each learning path and learning activity belongs to one user.
-   Users cannot access another user's private learning data.
-   Store the user's timezone for daily activity and streak
    calculations.
-   Store the preferred language if language selection is supported.

The coding agent should inspect the existing repository and recommend an
authentication approach compatible with its current architecture. Do not
introduce a second authentication system if one already exists.

## 5.2 Learning path

A learning path represents a user's learning goal.

Suggested fields:

-   Title
-   Topic
-   Description
-   Current level
-   Learning goal
-   Available study time
-   Content language
-   Status (e.g. draft, active, completed, archived)
-   AI generation status
-   Created and updated timestamps

Requirements:

-   A user can create multiple learning paths.
-   A user can view their own paths.
-   A user can archive or delete a path.
-   A user can edit basic path metadata.
-   The path contains ordered modules and lessons.
-   The user should be able to see the overall completion percentage.
-   If editing/reordering generated modules and lessons is supported,
    progress records must remain correctly associated with their lesson
    IDs.

## 5.3 Modules and lessons

A module groups related lessons in a logical order.

A lesson should have:

-   Title
-   Short description or learning objective
-   Sort order
-   Estimated duration (optional)
-   Content generation status
-   Lesson content (generated on demand)
-   Completion state for each user

Suggested lesson content sections:

1.  Learning objectives
2.  Explanation / theory
3.  Examples
4.  Key takeaways
5.  Further reading or resources

Store generated content in a structured format suitable for rendering in
the mobile app. Markdown is acceptable for the MVP if it is sanitized
and rendered safely. Do not render arbitrary HTML from model output
without sanitization.

## 5.4 Lesson resources

Resources are external references associated with a lesson.

MVP resource types:

-   YouTube video
-   Article or documentation link

Suggested fields:

-   Resource type
-   Title
-   URL
-   Provider
-   Thumbnail URL (optional)
-   Description (optional)
-   Sort order

YouTube resource requirements:

-   Use the YouTube Data API or another approved, verifiable search
    source to discover videos.
-   Do not ask the LLM to invent video URLs.
-   Validate that a returned URL is a valid YouTube URL and, where
    possible, that the video ID exists.
-   Treat external links and metadata as untrusted input.
-   If no reliable resource is found, show no resource or explain that
    no suitable resource was found. Do not fabricate one.

The owner must confirm the YouTube API key, quota, and billing/usage
constraints before implementation.

## 5.5 Quiz

MVP quiz requirements:

-   A quiz belongs to a lesson.
-   Generate a configurable number of questions; suggested default is 5.
-   Support single-choice multiple-choice questions initially.
-   Each question has a prompt, options, correct answer, and
    explanation.
-   Questions should be based on the associated lesson content.
-   Store the answer key on the backend.
-   Store user attempts and scores.
-   Show explanations after submission.
-   Allow retrying a quiz.

AI-generated quiz output must be validated. Reject questions with
missing options, invalid answer references, duplicate options, or no
valid correct answer.

## 5.6 Progress tracking

Track lesson completion per user.

Suggested states:

-   Not started
-   In progress
-   Completed

A lesson can become in progress when the user opens it or performs a
meaningful learning action. The exact rule should be consistent across
the app.

Learning-path progress should be derived from lesson progress, for
example:

`completed lesson count / total lesson count * 100`

Define rounding behavior consistently. Avoid storing a progress
percentage as the only source of truth if it can be derived from lesson
completion records.

## 5.7 Daily activity and streak

Purpose: encourage consistent learning without making streaks easy to
exploit.

Recommended MVP rule:

-   A user qualifies for a learning day after completing at least one
    lesson or submitting at least one quiz attempt that meets the chosen
    qualification rule.
-   Multiple qualifying actions on the same local calendar day count as
    one active day.
-   A streak increases by at most one per local day.
-   If the user misses a calendar day, the current streak resets when
    the next qualifying activity occurs.
-   Store and use the user's IANA timezone (e.g. `Asia/Ho_Chi_Minh`) to
    determine the activity date.
-   Do not use the server's UTC date directly as the user's learning
    date.
-   Store a unique daily activity record per user and local date to
    prevent duplicate streak increments.

Suggested dashboard data:

-   Current streak
-   Longest streak
-   Whether the user has learned today
-   Recent activity calendar
-   Total completed lessons
-   Total quiz attempts
-   Total learning paths

**Important edge cases for implementation:**

-   First qualifying activity.
-   Multiple actions on one day.
-   Activity around midnight in the user's timezone.
-   User timezone changes.
-   A missed day followed by a new activity.
-   Concurrent qualifying requests.
-   Retried API requests.
-   Backdated or imported activity (not required for MVP).

Streak logic should be implemented in a transaction or with appropriate
uniqueness and concurrency controls.

------------------------------------------------------------------------

# 6. AI Requirements and Workflows

AI is a core capability. Keep prompts, schemas, model configuration, and
generation logic isolated from controllers and UI-specific code.

## 6.1 General AI rules

-   Use structured output / JSON Schema when supported by the selected
    provider.
-   Validate all AI output on the backend.
-   Treat AI output as untrusted data.
-   Never execute generated code or HTML.
-   Set reasonable token/output limits.
-   Handle provider errors, timeouts, rate limits, and malformed output.
-   Avoid generating the same content repeatedly when a valid result is
    already stored.
-   Record generation status and enough metadata for debugging, without
    logging secrets or unnecessary personal data.
-   Make model and prompt versions configurable.
-   Do not expose API keys to the mobile client.

## 6.2 Workflow A: Generate learning path

**Input:**

-   Topic
-   Current level
-   Learning goal
-   Available study time
-   Content language

**Expected output:**

-   Path title
-   Path description
-   Modules in learning order
-   Lessons within each module
-   Lesson title
-   Lesson summary
-   Learning objectives
-   Estimated duration (optional)
-   Prerequisite relationship or ordering where useful

**Quality requirements:**

-   The roadmap should progress from foundational to advanced concepts
    appropriate to the user's level and goal.
-   Avoid unnecessary repetition between lessons.
-   Keep lesson scope manageable.
-   Do not promise a specific mastery level or completion date.
-   Do not invent references or citations.
-   The output must be structured and validated before saving.

## 6.3 Workflow B: Generate lesson content

**Input:**

-   Learning path context
-   Module context
-   Lesson title and description
-   Learning objectives
-   User's current level
-   Content language

**Expected output:**

-   Short introduction
-   Main theory, organized into sections
-   Examples where appropriate
-   Key takeaways
-   Optional practice suggestions
-   Optional suggested search keywords for finding external resources

**Quality requirements:**

-   Explain concepts at the requested level.
-   Keep content focused on the lesson objectives.
-   Use examples that are technically and factually coherent.
-   Avoid unsupported claims.
-   Do not include fabricated URLs.
-   Keep content readable on a mobile screen.

## 6.4 Workflow C: Find YouTube resources

This may be a separate integration rather than an LLM generation step.

**Input:**

-   Lesson title
-   Lesson summary
-   Relevant search keywords
-   Content language

**Expected output:**

-   Verified video title
-   Video ID / URL
-   Channel name, if available
-   Thumbnail URL, if available
-   Duration, if available

Use an approved search API. The LLM may suggest search keywords, but the
actual resource URL must come from a verifiable provider response.

## 6.5 Workflow D: Generate quiz

**Input:**

-   Lesson content
-   Learning objectives
-   User level
-   Question count
-   Content language

**Expected output:**

-   Questions
-   Options
-   Correct option identifier
-   Explanation for the correct answer
-   Optional explanation for incorrect options

**Quality requirements:**

-   Every question must be answerable using the lesson content.
-   Questions should test understanding, not merely copy sentences.
-   Options should be distinct and unambiguous.
-   There must be exactly one correct answer for single-choice
    questions.
-   Do not reveal the answer key to the client before submission.
-   Validate every question and answer before persistence.

------------------------------------------------------------------------

# 7. Suggested Data Model

This is a conceptual starting point, not a final migration
specification. The coding agent should inspect the existing project, ORM
conventions, and naming standards before proposing migrations.

## 7.1 Entities

### User

-   id
-   email / authentication provider identifiers
-   display name
-   timezone
-   preferred language
-   created_at
-   updated_at

### LearningPath

-   id
-   user_id
-   title
-   topic
-   description
-   current_level
-   learning_goal
-   available_study_time
-   content_language
-   status
-   generation_status
-   created_at
-   updated_at

### LearningModule

-   id
-   learning_path_id
-   title
-   description
-   sort_order
-   created_at
-   updated_at

### Lesson

-   id
-   module_id
-   title
-   description
-   learning_objectives
-   estimated_duration
-   sort_order
-   content (structured JSON or sanitized Markdown, subject to
    implementation decision)
-   content_generation_status
-   content_generated_at
-   created_at
-   updated_at

### LessonResource

-   id
-   lesson_id
-   resource_type
-   title
-   url
-   provider
-   external_resource_id
-   thumbnail_url
-   description
-   sort_order
-   created_at

### Quiz

-   id
-   lesson_id
-   title
-   generation_status
-   created_at
-   updated_at

### QuizQuestion

-   id
-   quiz_id
-   question
-   question_type
-   options (structured JSON or normalized child table; agent to
    evaluate)
-   correct_answer (server-side only)
-   explanation
-   sort_order
-   created_at

### QuizAttempt

-   id
-   quiz_id
-   user_id
-   score
-   total_questions
-   correct_answers
-   submitted_at
-   created_at

### QuizAttemptAnswer

-   id
-   quiz_attempt_id
-   question_id
-   selected_answer
-   is_correct
-   created_at

### LessonProgress

-   id
-   user_id
-   lesson_id
-   status
-   started_at
-   completed_at
-   updated_at

### DailyActivity

-   id
-   user_id
-   activity_date (date in the user's timezone)
-   qualifying_activity_count
-   created_at
-   updated_at

### UserLearningStats (optional derived/cache table)

-   user_id
-   current_streak
-   longest_streak
-   last_activity_date
-   updated_at

## 7.2 Relationship overview

``` text
User
 ├── LearningPath
 │    └── LearningModule
 │         └── Lesson
 │              ├── LessonResource
 │              ├── Quiz
 │              │    ├── QuizQuestion
 │              │    └── QuizAttempt
 │              │         └── QuizAttemptAnswer
 │              └── LessonProgress
 ├── QuizAttempt
 ├── LessonProgress
 └── DailyActivity
```

## 7.3 Data integrity and indexing considerations

The implementation plan should consider:

-   Foreign keys for ownership and parent-child relationships.
-   Unique `(user_id, lesson_id)` for lesson progress.
-   Unique `(user_id, activity_date)` for daily activity.
-   Unique or otherwise controlled quiz generation per lesson, if only
    one active quiz is supported.
-   Indexes for common user-scoped list queries.
-   Indexes for module/lesson ordering.
-   Cascading deletion or archival behavior for learning paths and
    dependent entities.
-   Transactions for quiz submission, lesson completion, and streak
    updates where needed.
-   Authorization checks on every user-owned resource.

Do not introduce complex partitioning, event sourcing, or microservices
for this MVP without a measured need.

------------------------------------------------------------------------

# 8. API Surface --- Initial Proposal

The coding agent should adapt route names, response conventions,
validation, pagination, and authentication to the existing codebase.

Illustrative REST endpoints:

## Learning paths

-   `POST /learning-paths` --- create a path and request AI generation.
-   `GET /learning-paths` --- list the current user's paths.
-   `GET /learning-paths/:pathId` --- get path details with modules and
    lessons.
-   `PATCH /learning-paths/:pathId` --- update editable path metadata.
-   `DELETE /learning-paths/:pathId` --- archive or delete a path
    according to product policy.

## Lessons

-   `GET /lessons/:lessonId` --- get lesson details and stored content.
-   `POST /lessons/:lessonId/generate-content` --- generate content if
    not already available.
-   `POST /lessons/:lessonId/complete` --- mark lesson as completed.
-   `GET /lessons/:lessonId/resources` --- list lesson resources.

## Quizzes

-   `POST /lessons/:lessonId/quiz/generate` --- generate a quiz if one
    does not exist.
-   `GET /lessons/:lessonId/quiz` --- get quiz questions without answer
    keys.
-   `POST /quizzes/:quizId/attempts` --- submit answers and receive a
    graded result.
-   `GET /quizzes/:quizId/attempts` --- list the current user's
    attempts.

## Dashboard and activity

-   `GET /dashboard` --- summary, continue-learning target, and streak.
-   `GET /activity` --- recent daily activity.
-   `GET /streak` --- current streak, longest streak, and today's
    status.

These endpoints are proposals. The agent should avoid creating redundant
endpoints if equivalent application patterns already exist.

## 8.1 API behavior requirements

-   Enforce authentication and ownership.
-   Validate all request bodies and path parameters.
-   Return consistent error formats.
-   Use appropriate HTTP status codes.
-   Make state-changing requests safe against retries where practical.
-   Do not expose quiz answer keys before submission.
-   Do not return provider secrets or internal prompt data.
-   Consider asynchronous job status for long-running AI generation.
-   Avoid blocking ordinary API requests for unnecessarily long AI
    operations.

------------------------------------------------------------------------

# 9. AI Generation Execution and Reliability

AI generation may be slow or fail. The implementation plan should
explicitly decide whether each generation flow is synchronous or
asynchronous.

Suggested approach:

-   Learning-path generation: can be synchronous for a small output, but
    use a background job if latency or output size becomes significant.
-   Lesson generation: on-demand; background generation is preferred if
    the provider latency is high.
-   Quiz generation: on-demand; background generation if necessary.
-   YouTube search: call the external provider separately and handle
    provider failures independently from lesson generation.

If the repository already uses BullMQ and Redis, evaluate reusing them.
Do not add a queue just for architectural fashion.

Suggested generation states:

-   pending
-   processing
-   completed
-   failed

Reliability requirements:

-   Prevent duplicate jobs for the same target and generation version.
-   Handle retries with bounded attempts and backoff.
-   Persist failure state and a user-safe error message.
-   Do not overwrite valid generated content with an empty or invalid
    response.
-   Make jobs safe to retry.
-   Avoid duplicate database records on worker retries.
-   Provide a way for the client to check generation status.
-   Consider provider rate limits and per-user usage limits.

------------------------------------------------------------------------

# 10. Mobile UX Requirements

The mobile experience should be simple and optimized for short,
repeatable learning sessions.

Suggested primary navigation:

1.  **Home:** streak, progress summary, continue learning, recent paths.
2.  **My Learning:** list and manage learning paths.
3.  **Create:** enter a topic and generate a path.
4.  **Profile:** account, timezone, language, and settings.

Core screens:

-   Sign in / sign up
-   Home dashboard
-   Create learning path
-   Generation loading / failure state
-   Learning path detail
-   Lesson detail
-   Quiz
-   Quiz result
-   Activity / streak view
-   Profile and settings

UX requirements:

-   Clearly distinguish generated, generating, and failed content.
-   Show loading and retry states for AI operations.
-   Make "Continue learning" easy to find.
-   Make lesson completion state visible.
-   Display quiz explanations after submission.
-   Keep lesson content readable on small screens.
-   External resources should open safely in an appropriate browser or
    supported video experience.
-   Do not make streak the only measure of learning success.

Visual direction (not a strict design system):

-   Modern, calm, friendly, and focused.
-   Clear typography and generous spacing.
-   Subtle gamification rather than a noisy game interface.
-   Use a flame motif for streak, but do not overuse badges or
    animations.
-   Prioritize accessibility, readable contrast, and clear interaction
    states.

------------------------------------------------------------------------

# 11. Non-Functional Requirements

## Security and privacy

-   Keep AI provider keys and YouTube API keys on the backend.
-   Enforce user ownership for all learning data.
-   Validate and sanitize user input and generated content.
-   Treat external URLs as untrusted.
-   Do not expose quiz answer keys before grading.
-   Avoid logging sensitive user content unnecessarily.
-   Apply reasonable rate limits to AI generation endpoints.
-   Consider per-user quotas to prevent unexpected AI cost.
-   Provide a clear account/data deletion policy before public launch.

## Performance

-   Avoid regenerating content that is already available and valid.
-   Paginate user-owned lists if they can grow.
-   Avoid N+1 database queries.
-   Add indexes based on actual access patterns.
-   Keep dashboard queries efficient.
-   Handle slow AI providers without blocking unrelated requests.

## Observability

-   Log generation start, completion, and failure with
    correlation/request IDs.
-   Capture provider latency and error rates.
-   Track generation token usage/cost if the provider exposes it.
-   Track queue wait time and retry counts if a queue is used.
-   Never log API keys or authentication tokens.

## Maintainability

-   Keep provider integration behind a service/adapter boundary.
-   Keep prompts and output schemas versioned.
-   Separate AI generation, resource search, quiz grading, progress, and
    streak logic.
-   Use tests for business rules, especially timezone and streak
    behavior.
-   Prefer the existing repository conventions over introducing
    unnecessary abstractions.

------------------------------------------------------------------------

# 12. Acceptance Criteria

The MVP is considered functionally ready when the following scenarios
pass.

## Learning path

-   [ ] An authenticated user can create a learning path from a topic.
-   [ ] The user can provide a level and optional learning goal.
-   [ ] AI output is schema-validated before persistence.
-   [ ] The generated path contains ordered modules and lessons.
-   [ ] A user cannot view or modify another user's path.
-   [ ] AI failure is visible and recoverable without creating corrupt
    partial data.

## Lesson

-   [ ] A user can open a lesson.
-   [ ] Lesson content is generated when missing.
-   [ ] Existing valid content is reused rather than regenerated
    unnecessarily.
-   [ ] Lesson content is readable on mobile.
-   [ ] External resources have verifiable URLs.
-   [ ] A user can mark a lesson as completed.

## Quiz

-   [ ] A user can generate or retrieve a quiz for a lesson.
-   [ ] Quiz questions are based on lesson content.
-   [ ] Correct answers are not exposed before submission.
-   [ ] A submitted attempt is graded on the backend.
-   [ ] Score and explanations are displayed.
-   [ ] Retrying a quiz does not overwrite prior attempts.

## Progress and streak

-   [ ] Completing a lesson updates its progress.
-   [ ] Learning-path progress reflects completed lessons.
-   [ ] A qualifying activity creates at most one daily activity record
    per user and local date.
-   [ ] Multiple qualifying actions on the same local day do not
    increment the streak multiple times.
-   [ ] Streak calculation uses the user's timezone.
-   [ ] A missed day breaks the current streak.
-   [ ] Current streak and longest streak are displayed correctly.

## General

-   [ ] Authentication and ownership checks cover all private endpoints.
-   [ ] Loading, empty, error, and retry states are implemented.
-   [ ] AI and external API failures do not corrupt existing data.
-   [ ] Core business rules have automated tests.

------------------------------------------------------------------------

# 13. Suggested Implementation Phases

The coding agent should produce a more detailed plan after inspecting
the repository. A reasonable sequence is:

## Phase 0 --- Repository discovery and technical plan

-   Inspect the repository, current stack, conventions, and existing
    modules.
-   Identify reusable authentication, database, API, UI, and job
    infrastructure.
-   Identify missing integrations and required credentials.
-   Propose architecture and data model changes.
-   Identify risks, open questions, and implementation dependencies.
-   Produce a phased plan and test strategy.
-   **Do not start implementation until the project owner reviews the
    plan.**

## Phase 1 --- Application foundation

-   Authentication and user profile integration.
-   Database schema and migrations.
-   Learning path/module/lesson read and write operations.
-   Basic mobile navigation and screens.

## Phase 2 --- AI learning path generation

-   Provider adapter and configuration.
-   Prompt and schema for learning path generation.
-   Validation and persistence.
-   Generation status and failure handling.
-   Create-path UX.

## Phase 3 --- Lesson content and resources

-   On-demand lesson generation.
-   Content rendering.
-   YouTube resource search integration.
-   Resource validation and failure handling.

## Phase 4 --- Quiz

-   Quiz generation and schema validation.
-   Quiz persistence.
-   Quiz attempt submission and server-side grading.
-   Result and explanation screens.

## Phase 5 --- Progress, dashboard, and streak

-   Lesson progress.
-   Learning-path progress calculation.
-   Daily activity records.
-   Timezone-aware streak logic.
-   Dashboard and continue-learning experience.

## Phase 6 --- Hardening and release preparation

-   Authorization and security review.
-   AI cost/rate-limit controls.
-   Error handling and observability.
-   Automated tests.
-   Mobile UX polish.
-   App configuration and release checklist.

------------------------------------------------------------------------

# 14. Open Product and Technical Decisions

Do not silently assume answers to these questions. During planning,
identify which decisions block implementation and propose sensible
defaults.

1.  **Mobile framework:** Is the app built with Flutter, React Native,
    or another framework?
2.  **Backend:** Is there an existing backend, or should one be created?
3.  **AI provider/model:** Which provider should be used? Compare output
    quality, structured-output support, latency, and cost.
4.  **Content language:** Is the MVP English-only, Vietnamese-only, or
    multilingual?
5.  **Learning path editing:** Can users edit, delete, and reorder
    generated modules and lessons in the first release?
6.  **Quiz format:** Start with single-choice questions only, or include
    multiple-select and true/false?
7.  **Quiz generation:** One quiz per lesson, or generate a fresh quiz
    for every attempt?
8.  **Lesson completion:** Can users mark a lesson complete without
    taking the quiz? Recommended: yes.
9.  **Streak qualification:** Does a completed lesson or any submitted
    quiz attempt qualify as a learning day? Recommended initial rule:
    completed lesson or a submitted quiz attempt with at least one
    answered question.
10. **Timezone changes:** Should historical activity dates remain fixed
    in the timezone used at the time, or be recalculated after a
    timezone change? Recommended: store the local activity date at event
    time and do not rewrite history.
11. **YouTube integration:** Is a YouTube Data API key available, and
    what quota is acceptable?
12. **Generation UX:** Should AI generation block the screen, or run as
    a background job with progress polling?
13. **Monetization:** Is the MVP free and usage-limited, or should
    monetization be considered now? Do not implement payments without
    approval.

------------------------------------------------------------------------

# 15. Instructions to the Coding Agent

You are responsible for analyzing the existing codebase and producing an
implementation plan for Athena.

## First task: plan only

1.  Inspect the repository structure and existing implementation.
2.  Read project instructions and conventions (for example `AGENTS.md`,
    `CLAUDE.md`, README files, and package manifests).
3.  Identify the current frontend/mobile framework, backend framework,
    database, ORM, authentication, state management, and job
    infrastructure.
4.  Map this specification to the existing architecture.
5.  Identify existing functionality that can be reused.
6.  Propose the minimal data model and API changes needed for the MVP.
7.  Propose AI provider integration, structured output schemas, prompt
    organization, and failure handling.
8.  Explain how YouTube resources will be discovered and verified.
9.  Specify the streak algorithm, timezone strategy, concurrency
    safeguards, and test cases.
10. Break the work into small, ordered implementation tasks with
    dependencies and acceptance criteria.
11. Identify unresolved decisions, risks, external credentials, and
    expected AI/API costs.
12. Recommend what should explicitly be deferred.

## Required planning deliverables

Produce:

-   `PLAN.md` --- phased implementation plan with tasks, dependencies,
    and acceptance criteria.
-   `ARCHITECTURE.md` --- proposed architecture and key technical
    decisions, based on the actual repository.
-   `DATA_MODEL.md` --- proposed entities, relationships, constraints,
    and indexes.
-   `OPEN_QUESTIONS.md` --- decisions that require product-owner input.

## Planning constraints

-   Do not modify application code, run destructive commands, or create
    migrations during the planning phase.
-   Do not assume the proposed stack is already present; inspect the
    repository first.
-   Do not introduce microservices or unnecessary infrastructure.
-   Reuse existing conventions and dependencies where reasonable.
-   Call out any mismatch between this specification and the current
    codebase.
-   Clearly distinguish confirmed repository facts from recommendations
    and assumptions.
-   If a decision is not blocking, state a recommended default rather
    than asking a long list of questions.
-   Stop after producing the planning deliverables and wait for approval
    before implementation.

------------------------------------------------------------------------

# 16. Definition of MVP Success

The MVP should demonstrate one complete learning loop:

**Create a learning goal → receive an AI learning path → study a
generated lesson → use a learning resource → complete a quiz → mark the
lesson done → see progress and streak update → return and continue
learning.**

The product is successful as an MVP when this loop is reliable,
understandable, and useful for a single user. Additional social
features, advanced gamification, and complex AI tutoring should come
only after validating this core experience.
