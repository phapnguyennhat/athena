import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { LessonContentEntity } from './lesson-content.entity.js';
import type { QuizQuestion } from '../lesson-output.js';

/** One quiz per lesson content. `questions` holds the answer key: strip it before sending to the client. */
@Entity('quizzes')
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_id', type: 'uuid', unique: true })
  contentId: string;

  @OneToOne(() => LessonContentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_id' })
  contentRow?: Relation<LessonContentEntity>;

  @Column({ type: 'jsonb' })
  questions: QuizQuestion[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
