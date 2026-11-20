import type { MigrationInterface, QueryRunner } from 'typeorm';

const FK_INDEXES = [
  ['IDX_learning_paths_user', 'learning_paths', 'user_id'],
  ['IDX_learning_paths_conversation', 'learning_paths', 'conversation_id'],
  ['IDX_path_modules_path', 'path_modules', 'path_id'],
  ['IDX_path_lessons_module', 'path_lessons', 'module_id'],
  ['IDX_ai_jobs_user', 'ai_jobs', 'user_id'],
] as const;

export class CreateLearningPaths1763400000000 implements MigrationInterface {
  name = 'CreateLearningPaths1763400000000';

  async up(q: QueryRunner): Promise<void> {
    const ts = `TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`;
    await q.query(`CREATE TABLE "path_conversations" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "status" character varying(16) NOT NULL DEFAULT 'open',
      "preferences" jsonb NOT NULL DEFAULT '{}',
      "ready" boolean NOT NULL DEFAULT false,
      "user_turns" integer NOT NULL DEFAULT 0,
      "created_at" ${ts}, "updated_at" ${ts},
      CONSTRAINT "PK_path_conversations" PRIMARY KEY ("id"),
      CONSTRAINT "FK_path_conversations_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE UNIQUE INDEX "one_open_conversation" ON "path_conversations" ("user_id") WHERE status = 'open'`);
    await q.query(`CREATE TABLE "path_messages" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "conversation_id" uuid NOT NULL,
      "role" character varying(16) NOT NULL,
      "content" text NOT NULL,
      "quick_replies" jsonb,
      "created_at" ${ts},
      CONSTRAINT "PK_path_messages" PRIMARY KEY ("id"),
      CONSTRAINT "FK_path_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "path_conversations"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE INDEX "IDX_path_messages_conversation_created" ON "path_messages" ("conversation_id", "created_at")`);
    await q.query(`CREATE TABLE "learning_paths" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "conversation_id" uuid,
      "status" character varying(16) NOT NULL DEFAULT 'draft',
      "title" character varying(200) NOT NULL,
      "summary" text NOT NULL,
      "created_at" ${ts}, "updated_at" ${ts},
      CONSTRAINT "PK_learning_paths" PRIMARY KEY ("id"),
      CONSTRAINT "FK_learning_paths_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_learning_paths_conversation" FOREIGN KEY ("conversation_id") REFERENCES "path_conversations"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE TABLE "path_modules" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "path_id" uuid NOT NULL,
      "position" integer NOT NULL,
      "title" character varying(200) NOT NULL,
      "created_at" ${ts}, "updated_at" ${ts},
      CONSTRAINT "PK_path_modules" PRIMARY KEY ("id"),
      CONSTRAINT "FK_path_modules_path" FOREIGN KEY ("path_id") REFERENCES "learning_paths"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE TABLE "path_lessons" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "module_id" uuid NOT NULL,
      "position" integer NOT NULL,
      "title" character varying(200) NOT NULL,
      "created_at" ${ts}, "updated_at" ${ts},
      CONSTRAINT "PK_path_lessons" PRIMARY KEY ("id"),
      CONSTRAINT "FK_path_lessons_module" FOREIGN KEY ("module_id") REFERENCES "path_modules"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE TABLE "ai_jobs" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "type" character varying(32) NOT NULL,
      "status" character varying(16) NOT NULL DEFAULT 'queued',
      "input" jsonb NOT NULL,
      "result_id" uuid,
      "error_code" character varying(64),
      "attempts" integer NOT NULL DEFAULT 0,
      "created_at" ${ts}, "updated_at" ${ts},
      CONSTRAINT "PK_ai_jobs" PRIMARY KEY ("id"),
      CONSTRAINT "FK_ai_jobs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE)`);
    await q.query(`CREATE UNIQUE INDEX "one_active_generate_job" ON "ai_jobs" ((input->>'conversationId')) WHERE type = 'generate_path' AND status IN ('queued','running')`);
    // Postgres doesn't index FK columns itself; these back owner lookups and cascading deletes.
    for (const [name, table, column] of FK_INDEXES) await q.query(`CREATE INDEX "${name}" ON "${table}" ("${column}")`);
  }

  async down(q: QueryRunner): Promise<void> {
    for (const [name] of FK_INDEXES) await q.query(`DROP INDEX "${name}"`);
    await q.query(`DROP INDEX "one_active_generate_job"`);
    await q.query(`DROP TABLE "ai_jobs"`);
    await q.query(`DROP TABLE "path_lessons"`);
    await q.query(`DROP TABLE "path_modules"`);
    await q.query(`DROP TABLE "learning_paths"`);
    await q.query(`DROP INDEX "IDX_path_messages_conversation_created"`);
    await q.query(`DROP TABLE "path_messages"`);
    await q.query(`DROP INDEX "one_open_conversation"`);
    await q.query(`DROP TABLE "path_conversations"`);
  }
}
