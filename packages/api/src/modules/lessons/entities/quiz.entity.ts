import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { PathLesson } from '../../learning-paths/entities/path-lesson.entity.js';
import type { QuizQuestion } from '../lesson-output.js';

/** One quiz per lesson. `questions` holds the answer key: strip it before sending to the client. */
@Entity('quizzes')
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lesson_id', type: 'uuid', unique: true })
  lessonId: string;

  @OneToOne(() => PathLesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lesson_id' })
  lesson?: Relation<PathLesson>;

  @Column({ type: 'jsonb' })
  questions: QuizQuestion[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
