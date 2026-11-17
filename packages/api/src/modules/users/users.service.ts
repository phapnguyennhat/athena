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

  /** Includes `passwordHash`, for sign-in only. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async create(
    data: Pick<User, 'email' | 'passwordHash' | 'fullName' | 'dateOfBirth' | 'timezone'> &
      Partial<Pick<User, 'preferredLanguage'>>,
  ): Promise<User> {
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
}
