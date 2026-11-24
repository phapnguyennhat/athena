import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { LessonContent } from '../lesson-output.js';

/** A lesson's generated content, shared by every lesson (original and copies) that points at it. */
@Entity('lesson_contents')
export class LessonContentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Validated generated content; null until the first generate_lesson job succeeds. */
  @Column({ type: 'jsonb', nullable: true })
  content: LessonContent | null;

  @Column({ name: 'search_keywords', type: 'jsonb', nullable: true })
  searchKeywords: string[] | null;

  @Column({ name: 'generated_at', type: 'timestamptz', nullable: true })
  generatedAt: Date | null;

  @Column({ name: 'generating_since', type: 'timestamptz', nullable: true })
  generatingSince: Date | null;

  @Column({ name: 'quiz_generating_since', type: 'timestamptz', nullable: true })
  quizGeneratingSince: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
