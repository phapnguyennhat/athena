import type { MigrationInterface, QueryRunner } from 'typeorm';

const FK_INDEXES = [
  ['IDX_lesson_resources_lesson', 'lesson_resources', 'lesson_id'],
  ['IDX_quiz_attempts_quiz_user', 'quiz_attempts', 'quiz_id", "user_id'],
  ['IDX_quiz_attempts_user', 'quiz_attempts', 'user_id'],
  ['IDX_lesson_progress_lesson', 'lesson_progress', 'lesson_id'],
  ['IDX_lesson_progress_user_updated', 'lesson_progress', 'user_id", "updated_at'],
] as const;

/** Lesson content, resources, quizzes, progress and streaks (PROJECT_SPEC §5.3–5.7). */
export class ExtendLearning1763500000000 implements MigrationInterface {
  name = 'ExtendLearning1763500000000';

  async up(q: QueryRunner): Promise<void> {
    const ts = `TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`;
    await q.query(`ALTER TABLE "learning_paths"
      ADD "preferences" jsonb NOT NULL DEFAULT '{}',
      ADD "content_language" character varying(16) NOT NULL DEFAULT 'vi'`);
    // Paths generated before this migration take their preferences from the conversation, when it still exists.
    await q.query(`UPDATE "learning_paths" p SET "preferences" = c."preferences"
      FROM "path_conversations" c WHERE c."id" = p."conversation_id"`);
    await q.query(`ALTER TABLE "path_lessons"
      ADD "content" jsonb,
      ADD "search_keywords" jsonb,
      ADD "content_generated_at" TIMESTAMP WITH TIME ZONE`);
    await q.query(`CREATE TABLE "lesson_resources" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "lesson_id" uuid NOT NULL,
      "provider" character varying(16) NOT NULL,
      "external_id" character varying(64) NOT NULL,
      "title" character varying(300) NOT NULL,
      "channel" character varying(200),
      "thumbnail_url" character varying(500),
      "position" integer NOT NULL,
      "created_at" ${ts},
      CONSTRAINT "PK_lesson_resources" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_lesson_resources_lesson_external" UNIQUE ("lesson_id", "provider", "external_id"),
      CONSTRAINT "FK_lesson_resources_lesson" FOREIGN KEY ("lesson_id") REFERENCES "path_lessons"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE TABLE "quizzes" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "lesson_id" uuid NOT NULL,
      "questions" jsonb NOT NULL,
      "created_at" ${ts},
      CONSTRAINT "PK_quizzes" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_quizzes_lesson" UNIQUE ("lesson_id"),
      CONSTRAINT "FK_quizzes_lesson" FOREIGN KEY ("lesson_id") REFERENCES "path_lessons"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE TABLE "quiz_attempts" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "quiz_id" uuid NOT NULL,
      "user_id" uuid NOT NULL,
      "answers" jsonb NOT NULL,
      "correct" integer NOT NULL,
      "total" integer NOT NULL,
      "created_at" ${ts},
      CONSTRAINT "PK_quiz_attempts" PRIMARY KEY ("id"),
      CONSTRAINT "FK_quiz_attempts_quiz" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_quiz_attempts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE TABLE "lesson_progress" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "lesson_id" uuid NOT NULL,
      "status" character varying(16) NOT NULL DEFAULT 'in_progress',
      "started_at" ${ts},
      "completed_at" TIMESTAMP WITH TIME ZONE,
      "updated_at" ${ts},
      CONSTRAINT "PK_lesson_progress" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_lesson_progress_user_lesson" UNIQUE ("user_id", "lesson_id"),
      CONSTRAINT "FK_lesson_progress_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_lesson_progress_lesson" FOREIGN KEY ("lesson_id") REFERENCES "path_lessons"("id") ON DELETE CASCADE)`);
    // No lesson/path FK: learning history (and the streak built on it) survives deleting a path.
    await q.query(`CREATE TABLE "daily_activity" (
      "user_id" uuid NOT NULL,
      "activity_date" date NOT NULL,
      "count" integer NOT NULL DEFAULT 1,
      "created_at" ${ts}, "updated_at" ${ts},
      CONSTRAINT "PK_daily_activity" PRIMARY KEY ("user_id", "activity_date"),
      CONSTRAINT "FK_daily_activity_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await q.query(`ALTER TABLE "users"
      ADD "current_streak" integer NOT NULL DEFAULT 0,
      ADD "longest_streak" integer NOT NULL DEFAULT 0,
      ADD "last_activity_date" date`);
    await q.query(`CREATE UNIQUE INDEX "one_active_lesson_job" ON "ai_jobs" ("type", (input->>'lessonId')) WHERE type IN ('generate_lesson','generate_quiz') AND status IN ('queued','running')`);
    for (const [name, table, column] of FK_INDEXES) await q.query(`CREATE INDEX "${name}" ON "${table}" ("${column}")`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const [name] of FK_INDEXES) await q.query(`DROP INDEX "${name}"`);
    await q.query(`DROP INDEX "one_active_lesson_job"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "last_activity_date", DROP COLUMN "longest_streak", DROP COLUMN "current_streak"`);
    await q.query(`DROP TABLE "daily_activity"`);
    await q.query(`DROP TABLE "lesson_progress"`);
    await q.query(`DROP TABLE "quiz_attempts"`);
    await q.query(`DROP TABLE "quizzes"`);
    await q.query(`DROP TABLE "lesson_resources"`);
    await q.query(`ALTER TABLE "path_lessons" DROP COLUMN "content_generated_at", DROP COLUMN "search_keywords", DROP COLUMN "content"`);
    await q.query(`ALTER TABLE "learning_paths" DROP COLUMN "content_language", DROP COLUMN "preferences"`);
  }
}
