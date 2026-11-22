import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './user.entity.js';

const UNIQUE_VIOLATION = '23505';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOneBy({ email });
  }

  /** Sets `emailVerifiedAt` once; `false` if it was already set. */
  async markEmailVerified(id: string): Promise<boolean> {
    const { affected } = await this.users
      .createQueryBuilder()
      .update()
      .set({ emailVerifiedAt: () => 'now()' })
      .where('id = :id AND email_verified_at IS NULL', { id })
      .execute();
    return affected === 1;
  }

  async updateProfile(id: string, patch: Partial<Pick<User, 'fullName' | 'dateOfBirth' | 'timezone'>>): Promise<User> {
    // TypeORM throws on an update with nothing to set.
    if (Object.keys(patch).length > 0) await this.users.update(id, patch);
    return (await this.findById(id))!;
  }

  async updateAvatarKey(id: string, avatarKey: string): Promise<void> {
    await this.users.update(id, { avatarKey });
  }

  /** Includes `passwordHash`, for password checks only. */
  findWithPassword(by: { email: string } | { id: string }): Promise<User | null> {
    return this.users.createQueryBuilder('user').addSelect('user.passwordHash').where(by).getOne();
  }

  async create(data: Pick<User, 'email' | 'passwordHash' | 'fullName' | 'dateOfBirth' | 'timezone'>): Promise<User> {
    try {
      const { passwordHash: _, ...user } = await this.users.save(this.users.create(data));
      return user as User;
    } catch (error) {
      if (error instanceof QueryFailedError && (error.driverError as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.users.update({ id }, { passwordHash });
  }

  /** Soft delete: the row (and the learning data hanging off it) stays, but every read skips it. */
  async softDelete(id: string): Promise<void> {
    await this.users.softDelete({ id });
  }
}
