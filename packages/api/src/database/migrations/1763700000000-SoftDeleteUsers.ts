import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SoftDeleteUsers1763700000000 implements MigrationInterface {
  name = 'SoftDeleteUsers1763700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "deleted_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email_active" ON "users" ("email") WHERE "deleted_at" IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Fails if a deleted account's email was registered again; resolve those rows first.
    await queryRunner.query(`DROP INDEX "UQ_users_email_active"`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deleted_at"`);
  }
}
