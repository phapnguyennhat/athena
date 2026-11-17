import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PasswordHasher, TokenService, type JwtClaims, type TokenPair } from '@nestjs/authentication';
import { UsersService } from '../users/users.service.js';
import { AccessTokenDenylist } from './access-token-denylist.js';
import type { SignInDto } from './dto/sign-in.dto.js';
import type { SignUpDto } from './dto/sign-up.dto.js';

const PASSWORD_SIGN_IN = { method: 'password', claims: { amr: ['pwd'] } };

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly denylist: AccessTokenDenylist,
  ) {}

  async signUp({ password, ...profile }: SignUpDto): Promise<TokenPair> {
    // YYYY-MM-DD strings compare in date order.
    if (profile.dateOfBirth < '1900-01-01' || profile.dateOfBirth >= new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('dateOfBirth must be a past date');
    }
    const user = await this.users.create({ ...profile, passwordHash: await this.hasher.hash(password) });
    return this.tokens.issue(user.id, PASSWORD_SIGN_IN);
  }

  async signIn({ email, password }: SignInDto): Promise<TokenPair> {
    const user = await this.users.findByEmailWithPassword(email);
    // verify() runs for unknown users too, so timing doesn't reveal which emails exist.
    const valid = await this.hasher.verify(password, user?.passwordHash);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    if (this.hasher.needsRehash(user.passwordHash!)) {
      await this.users.updatePasswordHash(user.id, await this.hasher.hash(password));
    }
    return this.tokens.issue(user.id, PASSWORD_SIGN_IN);
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.refresh(refreshToken);
  }

  /** Ends this device's sign-in: its refresh-token family and the access token in hand. */
  async signOut(refreshToken: string, accessToken: JwtClaims): Promise<void> {
    await Promise.all([this.tokens.revoke(refreshToken), this.denylist.revoke(accessToken)]);
  }
}
