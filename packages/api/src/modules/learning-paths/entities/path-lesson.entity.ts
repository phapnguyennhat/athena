import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, type Relation } from 'typeorm';
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
