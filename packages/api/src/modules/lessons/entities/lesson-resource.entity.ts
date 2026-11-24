import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { LessonContentEntity } from './lesson-content.entity.js';

/** A verified external resource. Only `youtube` today; `external_id` is the provider's id, never a model-made URL. */
@Entity('lesson_resources')
export class LessonResource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @ManyToOne(() => LessonContentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_id' })
  contentRow?: Relation<LessonContentEntity>;

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
