import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lesson content, videos and quizzes move to `lesson_contents` so copies of a course can share one generated row.
 * Existing rows reuse the lesson id as content id, so resources and quizzes are repointed by a column rename.
 */
export class SharedLessonContent1763900000000 implements MigrationInterface {
  name = 'SharedLessonContent1763900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "lesson_contents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "content" jsonb, "search_keywords" jsonb, "generated_at" TIMESTAMP WITH TIME ZONE, "generating_since" TIMESTAMP WITH TIME ZONE, "quiz_generating_since" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_lesson_contents" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `INSERT INTO "lesson_contents" ("id", "content", "search_keywords", "generated_at", "created_at")
       SELECT "id", "content", "search_keywords", "content_generated_at", "created_at" FROM "path_lessons"`,
    );
    await queryRunner.query(`ALTER TABLE "path_lessons" ADD "content_id" uuid`);
    await queryRunner.query(`UPDATE "path_lessons" SET "content_id" = "id"`);
    await queryRunner.query(`ALTER TABLE "path_lessons" ALTER COLUMN "content_id" SET NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE "path_lessons" ADD CONSTRAINT "FK_path_lessons_content" FOREIGN KEY ("content_id") REFERENCES "lesson_contents"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_path_lessons_content" ON "path_lessons" ("content_id")`);
    await queryRunner.query(
      `ALTER TABLE "path_lessons" DROP COLUMN "content", DROP COLUMN "search_keywords", DROP COLUMN "content_generated_at"`,
    );

    await queryRunner.query(`ALTER TABLE "lesson_resources" DROP CONSTRAINT "FK_lesson_resources_lesson"`);
    await queryRunner.query(`ALTER TABLE "lesson_resources" RENAME COLUMN "lesson_id" TO "content_id"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_resources" RENAME CONSTRAINT "UQ_lesson_resources_lesson_external" TO "UQ_lesson_resources_content_external"`,
    );
    await queryRunner.query(`ALTER INDEX "IDX_lesson_resources_lesson" RENAME TO "IDX_lesson_resources_content"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_resources" ADD CONSTRAINT "FK_lesson_resources_content" FOREIGN KEY ("content_id") REFERENCES "lesson_contents"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`ALTER TABLE "quizzes" DROP CONSTRAINT "FK_quizzes_lesson"`);
    await queryRunner.query(`ALTER TABLE "quizzes" RENAME COLUMN "lesson_id" TO "content_id"`);
    await queryRunner.query(`ALTER TABLE "quizzes" RENAME CONSTRAINT "UQ_quizzes_lesson" TO "UQ_quizzes_content"`);
    await queryRunner.query(
      `ALTER TABLE "quizzes" ADD CONSTRAINT "FK_quizzes_content" FOREIGN KEY ("content_id") REFERENCES "lesson_contents"("id") ON DELETE CASCADE`,
    );
  }

  // Lossy once lessons share a content row: the content, videos and quiz go back to one lesson per row only
  // (the lesson whose id is the content id, else any); the other sharers' lessons come back without them.
  async down(queryRunner: QueryRunner): Promise<void> {
    const owner = `(SELECT DISTINCT ON ("content_id") "content_id", "id" FROM "path_lessons"
                    ORDER BY "content_id", ("id" = "content_id") DESC, "id") o`;

    await queryRunner.query(`ALTER TABLE "quizzes" DROP CONSTRAINT "FK_quizzes_content"`);
    await queryRunner.query(
      `DELETE FROM "quizzes" q WHERE NOT EXISTS (SELECT 1 FROM ${owner} WHERE o."content_id" = q."content_id")`,
    );
    await queryRunner.query(
      `UPDATE "quizzes" q SET "content_id" = o."id" FROM ${owner} WHERE o."content_id" = q."content_id"`,
    );
    await queryRunner.query(`ALTER TABLE "quizzes" RENAME CONSTRAINT "UQ_quizzes_content" TO "UQ_quizzes_lesson"`);
    await queryRunner.query(`ALTER TABLE "quizzes" RENAME COLUMN "content_id" TO "lesson_id"`);
    await queryRunner.query(
      `ALTER TABLE "quizzes" ADD CONSTRAINT "FK_quizzes_lesson" FOREIGN KEY ("lesson_id") REFERENCES "path_lessons"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(`ALTER TABLE "lesson_resources" DROP CONSTRAINT "FK_lesson_resources_content"`);
    await queryRunner.query(
      `DELETE FROM "lesson_resources" r WHERE NOT EXISTS (SELECT 1 FROM ${owner} WHERE o."content_id" = r."content_id")`,
    );
    await queryRunner.query(
      `UPDATE "lesson_resources" r SET "content_id" = o."id" FROM ${owner} WHERE o."content_id" = r."content_id"`,
    );
    await queryRunner.query(`ALTER INDEX "IDX_lesson_resources_content" RENAME TO "IDX_lesson_resources_lesson"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_resources" RENAME CONSTRAINT "UQ_lesson_resources_content_external" TO "UQ_lesson_resources_lesson_external"`,
    );
    await queryRunner.query(`ALTER TABLE "lesson_resources" RENAME COLUMN "content_id" TO "lesson_id"`);
    await queryRunner.query(
      `ALTER TABLE "lesson_resources" ADD CONSTRAINT "FK_lesson_resources_lesson" FOREIGN KEY ("lesson_id") REFERENCES "path_lessons"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "path_lessons" ADD "content" jsonb, ADD "search_keywords" jsonb, ADD "content_generated_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "path_lessons" l SET "content" = c."content", "search_keywords" = c."search_keywords", "content_generated_at" = c."generated_at"
       FROM ${owner}, "lesson_contents" c WHERE o."id" = l."id" AND c."id" = o."content_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_path_lessons_content"`);
    await queryRunner.query(`ALTER TABLE "path_lessons" DROP CONSTRAINT "FK_path_lessons_content"`);
    await queryRunner.query(`ALTER TABLE "path_lessons" DROP COLUMN "content_id"`);
    await queryRunner.query(`DROP TABLE "lesson_contents"`);
  }
}
