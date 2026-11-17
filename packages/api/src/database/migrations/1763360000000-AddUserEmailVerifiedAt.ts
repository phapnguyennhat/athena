import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserEmailVerifiedAt1763360000000 implements MigrationInterface {
  name = 'AddUserEmailVerifiedAt1763360000000';

  // Existing users start unverified: they get a code at their next sign-in.
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "email_verified_at" TIMESTAMP WITH TIME ZONE`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email_verified_at"`);
  }
}
