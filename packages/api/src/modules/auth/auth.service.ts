import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PasswordHasher, TokenService, type JwtClaims, type TokenPair } from '@nestjs/authentication';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AccessTokenDenylist } from './access-token-denylist.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { SignInDto } from './dto/sign-in.dto.js';
import { isPlausibleBirthDate, type SignUpDto } from './dto/sign-up.dto.js';
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
    if (!isPlausibleBirthDate(profile.dateOfBirth)) {
      throw new BadRequestException('dateOfBirth must be a past date');
    }
    const user = await this.users.create({ ...profile, passwordHash: await this.hasher.hash(password) });
    // The account exists either way; a failed email is recovered with resend-verification.
    await this.sendCodeSafely(user);
  }

  async signIn({ email, password }: SignInDto): Promise<TokenPair> {
    const user = await this.users.findWithPassword({ email });
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

  /** Verifies the emailed code. The user then signs in with their password. */
  async verifyEmail({ email, code }: VerifyEmailDto): Promise<void> {
    const user = await this.users.findByEmail(email);
    // One answer for unknown emails, verified accounts and wrong codes.
    const valid = user !== null && !user.emailVerifiedAt && (await this.emailVerification.verifyCode(user.id, code));
    if (!valid || !(await this.users.markEmailVerified(user.id))) {
      throw new BadRequestException('Invalid or expired code');
    }
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

  /** Sets a new password and signs out every device; the returned pair keeps this one signed in. */
  async changePassword(userId: string, { currentPassword, newPassword }: ChangePasswordDto): Promise<TokenPair> {
    await this.checkPassword(userId, currentPassword);
    await this.users.updatePasswordHash(userId, await this.hasher.hash(newPassword));
    // Other devices' access tokens still work until they expire (15 min); their refresh tokens stop now.
    await this.tokens.revokeAll(userId);
    return this.tokens.issue(userId, PASSWORD_SIGN_IN);
  }

  /** Soft-deletes the account; its email is free to sign up again. Every token stops working. */
  async deleteAccount(userId: string, password: string, accessToken: JwtClaims): Promise<void> {
    await this.checkPassword(userId, password);
    // Deleted first: JwtAuth no longer finds the user, so outstanding access tokens fail even if Redis does.
    await this.users.softDelete(userId);
    await Promise.all([this.tokens.revokeAll(userId), this.denylist.revoke(accessToken)]);
  }

  // 403, not 401: the app treats a 401 as an expired session and refreshes.
  private async checkPassword(userId: string, password: string): Promise<void> {
    const user = await this.users.findWithPassword({ id: userId });
    if (!user || !(await this.hasher.verify(password, user.passwordHash))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'WRONG_PASSWORD',
        message: 'Password is incorrect',
      });
    }
  }

  private async sendCodeSafely(user: User): Promise<void> {
    try {
      await this.emailVerification.sendCode(user);
    } catch (error) {
      this.logger.error(`Verification email for user ${user.id} failed`, error instanceof Error ? error.stack : error);
    }
  }
}
