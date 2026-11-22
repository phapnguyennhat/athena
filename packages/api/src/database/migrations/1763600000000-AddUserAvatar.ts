import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAvatar1763600000000 implements MigrationInterface {
  name = 'AddUserAvatar1763600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "avatar_key" character varying(255)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_key"`);
  }
}
