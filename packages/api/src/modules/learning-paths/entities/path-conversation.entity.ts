import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, type Relation } from 'typeorm';
import { User } from '../../users/user.entity.js';
import type { Preferences } from '../dto/learning-path.dto.js';
import { PathMessage } from './path-message.entity.js';

@Entity('path_conversations')
export class PathConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status: 'open' | 'closed';

  @Column({ type: 'jsonb', default: () => `'{}'` })
  preferences: Preferences;

  @Column({ type: 'boolean', default: false })
  ready: boolean;

  @Column({ name: 'user_turns', type: 'int', default: 0 })
  userTurns: number;

  @OneToMany(() => PathMessage, (m) => m.conversation)
  messages?: Relation<PathMessage>[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
