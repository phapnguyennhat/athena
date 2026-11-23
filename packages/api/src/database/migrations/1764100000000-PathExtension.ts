import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PathExtension1764100000000 implements MigrationInterface {
  name = 'PathExtension1764100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "learning_paths" ADD "outline_complete" boolean NOT NULL DEFAULT false`);
    // One active extension per course family: concurrent triggers share it, so the model runs once.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "one_active_extend_job" ON "ai_jobs" ((input->>'rootId'))
       WHERE type = 'extend_path' AND status IN ('queued', 'running')`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "one_active_extend_job"`);
    await queryRunner.query(`ALTER TABLE "learning_paths" DROP COLUMN "outline_complete"`);
  }
}
