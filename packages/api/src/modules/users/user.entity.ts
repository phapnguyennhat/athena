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

  @Column({ name: 'preferred_language', type: 'varchar', length: 8, default: 'en' })
  preferredLanguage: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
