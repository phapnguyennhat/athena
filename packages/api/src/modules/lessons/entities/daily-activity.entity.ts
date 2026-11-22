import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** One row per user and local day with a qualifying action; the streak is built on these. */
@Entity('daily_activity')
export class DailyActivity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** 'YYYY-MM-DD' in the user's timezone at the time of the action; never rewritten. */
  @PrimaryColumn({ name: 'activity_date', type: 'date' })
  activityDate: string;

  @Column({ type: 'int', default: 1 })
  count: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
