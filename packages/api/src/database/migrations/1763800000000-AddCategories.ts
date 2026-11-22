import type { MigrationInterface, QueryRunner } from 'typeorm';

// Slugs must equal slugify(name) in src/modules/learning-paths/categories.ts.
export const SEED: [string, string][] = [
  ['lap-trinh', 'Lập trình'],
  ['du-lieu-ai', 'Dữ liệu & AI'],
  ['ngoai-ngu', 'Ngoại ngữ'],
  ['toan-hoc', 'Toán học'],
  ['khoa-hoc-tu-nhien', 'Khoa học tự nhiên'],
  ['kinh-doanh-khoi-nghiep', 'Kinh doanh & Khởi nghiệp'],
  ['tai-chinh-ca-nhan', 'Tài chính cá nhân'],
  ['marketing', 'Marketing'],
  ['thiet-ke', 'Thiết kế'],
  ['am-nhac', 'Âm nhạc'],
  ['nghe-thuat-nhiep-anh', 'Nghệ thuật & Nhiếp ảnh'],
  ['suc-khoe-the-thao', 'Sức khỏe & Thể thao'],
  ['ky-nang-mem', 'Kỹ năng mềm'],
  ['lich-su-xa-hoi', 'Lịch sử & Xã hội'],
  ['khac', 'Khác'],
];

export class AddCategories1763800000000 implements MigrationInterface {
  name = 'AddCategories1763800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "slug" varchar(80) NOT NULL, "name" varchar(60) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_categories" PRIMARY KEY ("id"), CONSTRAINT "UQ_categories_slug" UNIQUE ("slug"))`,
    );
    await queryRunner.query(
      `INSERT INTO "categories" ("slug", "name") SELECT * FROM unnest($1::varchar[], $2::varchar[])`,
      [SEED.map((s) => s[0]), SEED.map((s) => s[1])],
    );
    await queryRunner.query(
      `ALTER TABLE "learning_paths" ADD "category_id" uuid, ADD "tags" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "learning_paths" ADD CONSTRAINT "FK_learning_paths_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_learning_paths_category" ON "learning_paths" ("category_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_learning_paths_tags" ON "learning_paths" USING GIN ("tags")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_learning_paths_tags"`);
    await queryRunner.query(`DROP INDEX "IDX_learning_paths_category"`);
    await queryRunner.query(`ALTER TABLE "learning_paths" DROP CONSTRAINT "FK_learning_paths_category"`);
    await queryRunner.query(`ALTER TABLE "learning_paths" DROP COLUMN "tags", DROP COLUMN "category_id"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
