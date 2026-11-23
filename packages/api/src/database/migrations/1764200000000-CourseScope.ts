import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CourseScope1764200000000 implements MigrationInterface {
  name = 'CourseScope1764200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // The knowledge areas a comprehensive course must teach, planned at generation: [{ area, covered }].
    await queryRunner.query(`ALTER TABLE "learning_paths" ADD "scope" jsonb`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "learning_paths" DROP COLUMN "scope"`);
  }
}
