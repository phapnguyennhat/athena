import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfile1763350000000 implements MigrationInterface {
  name = 'AddUserProfile1763350000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing rows get an empty name; the default is dropped so new rows must set one.
    await queryRunner.query(`ALTER TABLE "users" ADD "full_name" character varying(100) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "full_name" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "users" ADD "timezone" character varying(64) NOT NULL DEFAULT 'UTC'`);
    await queryRunner.query(`ALTER TABLE "users" ADD "preferred_language" character varying(8) NOT NULL DEFAULT 'en'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferred_language"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "timezone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "full_name"`);
  }
}
