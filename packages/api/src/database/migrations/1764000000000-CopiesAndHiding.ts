import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CopiesAndHiding1764000000000 implements MigrationInterface {
  name = 'CopiesAndHiding1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "learning_paths" ADD "source_path_id" uuid, ADD "hidden_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "learning_paths" ADD CONSTRAINT "FK_learning_paths_source" FOREIGN KEY ("source_path_id") REFERENCES "learning_paths"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_learning_paths_source" ON "learning_paths" ("source_path_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_learning_paths_source"`);
    await queryRunner.query(`ALTER TABLE "learning_paths" DROP CONSTRAINT "FK_learning_paths_source"`);
    await queryRunner.query(`ALTER TABLE "learning_paths" DROP COLUMN "hidden_at", DROP COLUMN "source_path_id"`);
  }
}
