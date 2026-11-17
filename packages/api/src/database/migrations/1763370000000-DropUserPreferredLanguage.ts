import type { MigrationInterface, QueryRunner } from 'typeorm';

// The app is Vietnamese only; lesson and quiz language follows the user's input instead.
export class DropUserPreferredLanguage1763370000000 implements MigrationInterface {
  name = 'DropUserPreferredLanguage1763370000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferred_language"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "preferred_language" character varying(8) NOT NULL DEFAULT 'en'`);
  }
}
