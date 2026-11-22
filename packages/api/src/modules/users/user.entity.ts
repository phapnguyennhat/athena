import { ApiHideProperty } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Stored lowercased; the unique index makes sign-up race-safe.
  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  // Null for future social-login accounts. Never selected unless asked for.
  @ApiHideProperty()
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true, select: false })
  passwordHash: string | null;

  @Column({ name: 'full_name', type: 'varchar', length: 100 })
  fullName: string;

  // 'YYYY-MM-DD'; pg returns `date` columns as strings.
  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: string;

  /** IANA name, e.g. `Asia/Ho_Chi_Minh`: the user's local day for streaks. */
  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  /** S3 key of the profile photo; clients get it as a signed `avatarUrl`. */
  @ApiHideProperty()
  @Column({ name: 'avatar_key', type: 'varchar', length: 255, nullable: true })
  avatarKey: string | null;

  /** Null until the user enters the emailed code; no tokens are issued before that. */
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  /** Maintained by StreakService; read through it, since a missed day only shows on the next activity. */
  @Column({ name: 'current_streak', type: 'int', default: 0 })
  currentStreak: number;

  @Column({ name: 'longest_streak', type: 'int', default: 0 })
  longestStreak: number;

  /** Local date ('YYYY-MM-DD') of the last qualifying activity. */
  @Column({ name: 'last_activity_date', type: 'date', nullable: true })
  lastActivityDate: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
