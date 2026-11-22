import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { LessonContentEntity } from '../../lessons/entities/lesson-content.entity.js';
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

  /** Content, videos and quiz live on this row; copies of a course share it. */
  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => LessonContentEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'content_id' })
  contentRow?: Relation<LessonContentEntity>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
