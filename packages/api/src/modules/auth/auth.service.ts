import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PasswordHasher, TokenService, type JwtClaims, type TokenPair } from '@nestjs/authentication';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AccessTokenDenylist } from './access-token-denylist.js';
import type { SignInDto } from './dto/sign-in.dto.js';
import type { SignUpDto } from './dto/sign-up.dto.js';
import type { VerifyEmailDto } from './dto/verify-email.dto.js';
import { EmailVerificationService } from './email-verification.service.js';

const PASSWORD_SIGN_IN = { method: 'password', claims: { amr: ['pwd'] } };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly denylist: AccessTokenDenylist,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  /** Creates the account and emails a verification code. Tokens come from `verifyEmail()`. */
  async signUp({ password, ...profile }: SignUpDto): Promise<void> {
    // YYYY-MM-DD strings compare in date order.
    if (profile.dateOfBirth < '1900-01-01' || profile.dateOfBirth >= new Date().toISOString().slice(0, 10)) {
      throw new BadRequestException('dateOfBirth must be a past date');
    }
    const user = await this.users.create({ ...profile, passwordHash: await this.hasher.hash(password) });
    // The account exists either way; a failed email is recovered with resend-verification.
    await this.sendCodeSafely(user);
  }

  async signIn({ email, password }: SignInDto): Promise<TokenPair> {
    const user = await this.users.findByEmailWithPassword(email);
    // verify() runs for unknown users too, so timing doesn't reveal which emails exist.
    const valid = await this.hasher.verify(password, user?.passwordHash);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    if (!user.emailVerifiedAt) {
      await this.sendCodeSafely(user);
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'email_unverified',
        message: 'Email is not verified. A verification code was sent.',
      });
    }
    if (this.hasher.needsRehash(user.passwordHash!)) {
      await this.users.updatePasswordHash(user.id, await this.hasher.hash(password));
    }
    return this.tokens.issue(user.id, PASSWORD_SIGN_IN);
  }

  /** Verifies the emailed code and signs the user in. */
  async verifyEmail({ email, code }: VerifyEmailDto): Promise<TokenPair> {
    const user = await this.users.findByEmail(email);
    // One answer for unknown emails, verified accounts and wrong codes.
    const valid = user !== null && !user.emailVerifiedAt && (await this.emailVerification.verifyCode(user.id, code));
    if (!valid || !(await this.users.markEmailVerified(user.id))) {
      throw new BadRequestException('Invalid or expired code');
    }
    return this.tokens.issue(user.id, { method: 'email-otp' });
  }

  /** Sends a new code to an unverified account. Answers the same whether or not one was sent. */
  async resendVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user || user.emailVerifiedAt) return;
    // Not awaited, so response time doesn't reveal that the account exists.
    void this.sendCodeSafely(user);
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.refresh(refreshToken);
  }

  /** Ends this device's sign-in: its refresh-token family and the access token in hand. */
  async signOut(refreshToken: string, accessToken: JwtClaims): Promise<void> {
    await Promise.all([this.tokens.revoke(refreshToken), this.denylist.revoke(accessToken)]);
  }

  private async sendCodeSafely(user: User): Promise<void> {
    try {
      await this.emailVerification.sendCode(user);
    } catch (error) {
      this.logger.error(`Verification email for user ${user.id} failed`, error instanceof Error ? error.stack : error);
    }
  }
}
