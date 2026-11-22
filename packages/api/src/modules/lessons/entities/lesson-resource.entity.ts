import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { PathLesson } from '../../learning-paths/entities/path-lesson.entity.js';

/** A verified external resource. Only `youtube` today; `external_id` is the provider's id, never a model-made URL. */
@Entity('lesson_resources')
export class LessonResource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @ManyToOne(() => PathLesson, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lesson_id' })
  lesson?: Relation<PathLesson>;

  @Column({ type: 'varchar', length: 16 })
  provider: 'youtube';

  @Column({ name: 'external_id', type: 'varchar', length: 64 })
  externalId: string;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  channel: string | null;

  @Column({
    name: 'thumbnail_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  thumbnailUrl: string | null;

  @Column({ type: 'int' })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
