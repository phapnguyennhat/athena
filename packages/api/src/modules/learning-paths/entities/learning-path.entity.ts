import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, type Relation } from 'typeorm';
import { User } from '../../users/user.entity.js';
import type { Preferences } from '../dto/learning-path.dto.js';
import { PathConversation } from './path-conversation.entity.js';
import { PathModule } from './path-module.entity.js';

@Entity('learning_paths')
export class LearningPathEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId: string | null;

  @ManyToOne(() => PathConversation, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: Relation<PathConversation> | null;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  status: 'draft' | 'active';

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  summary: string;

  /** The brief the path was generated from: lessons and quizzes are generated against it. */
  @Column({ type: 'jsonb', default: () => `'{}'` })
  preferences: Preferences;

  /** ISO 639-1 code of the learner's input; every generated lesson and quiz uses it. */
  @Column({ name: 'content_language', type: 'varchar', length: 16, default: 'vi' })
  contentLanguage: string;

  @OneToMany(() => PathModule, (m) => m.path)
  modules: Relation<PathModule>[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
