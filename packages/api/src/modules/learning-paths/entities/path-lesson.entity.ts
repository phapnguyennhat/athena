import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, type Relation } from 'typeorm';
import type { LessonContent } from '../../lessons/lesson-output.js';
import { PathModule } from './path-module.entity.js';

@Entity('path_lessons')
export class PathLesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'module_id', type: 'uuid' })
  moduleId: string;

  @ManyToOne(() => PathModule, (m) => m.lessons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_id' })
  module?: Relation<PathModule>;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  /** Validated generated content; null until the first generate_lesson job succeeds. */
  @Column({ type: 'jsonb', nullable: true })
  content: LessonContent | null;

  @Column({ name: 'search_keywords', type: 'jsonb', nullable: true })
  searchKeywords: string[] | null;

  @Column({ name: 'content_generated_at', type: 'timestamptz', nullable: true })
  contentGeneratedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
