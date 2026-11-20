import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, type Relation } from 'typeorm';
import { LearningPathEntity } from './learning-path.entity.js';
import { PathLesson } from './path-lesson.entity.js';

@Entity('path_modules')
export class PathModule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'path_id', type: 'uuid' })
  pathId: string;

  @ManyToOne(() => LearningPathEntity, (p) => p.modules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'path_id' })
  path?: Relation<LearningPathEntity>;

  @Column({ type: 'int' })
  position: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @OneToMany(() => PathLesson, (l) => l.module)
  lessons: Relation<PathLesson>[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
