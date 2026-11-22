import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentSession, CurrentUser, Public, type JwtClaims } from '@nestjs/authentication';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { User } from '../users/user.entity.js';
import { AuthService } from './auth.service.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { SignInDto } from './dto/sign-in.dto.js';
import { isPlausibleBirthDate, SignUpDto } from './dto/sign-up.dto.js';
import { TokenPairDto } from './dto/token-pair.dto.js';
import { AvatarUploadDto, SetAvatarDto } from './dto/avatar.dto.js';
import { ChangePasswordDto, DeleteAccountDto } from './dto/change-password.dto.js';
import { UpdateMeDto } from './dto/update-me.dto.js';
import { ResendVerificationDto, VerifyEmailDto } from './dto/verify-email.dto.js';
import { UsersService } from '../users/users.service.js';
import { StorageService } from '../../storage/storage.service.js';

const TOO_MANY_REQUESTS = {
  description: 'More than 10 requests a minute from this IP.',
};

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_UPLOAD_TTL = 5 * 60;
// JPEG files start with the SOI marker FF D8 FF.
const isJpeg = (b: Uint8Array) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

/** `/auth/me` responses: the user, with the photo's S3 key swapped for a signed URL. */
export type MeView = Omit<User, 'avatarKey' | 'deletedAt'> & { avatarUrl: string | null };

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly storage: StorageService,
  ) {}

  private async view({ avatarKey, deletedAt: _, ...user }: User): Promise<MeView> {
    return {
      ...user,
      avatarUrl: avatarKey ? await this.storage.signedUrl(avatarKey) : null,
    };
  }

  /** Create an account and email a 6-digit verification code, to send to `POST /auth/verify-email`. */
  @Public()
  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'Account created; verification code emailed.',
  })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiBadRequestResponse({
    description: 'Invalid body, unknown field, or a date of birth not in the past.',
  })
  @ApiConflictResponse({ description: 'Email is already registered.' })
  signUp(@Body() dto: SignUpDto): Promise<void> {
    return this.auth.signUp(dto);
  }

  /** Verify the email with the emailed code. Then sign in with `POST /auth/sign-in`. */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Email verified.' })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiBadRequestResponse({
    description: 'Invalid body, or an invalid or expired code (a code allows 5 attempts and lasts 10 minutes).',
  })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<void> {
    return this.auth.verifyEmail(dto);
  }

  /** Email a new verification code (at most one a minute). Answers 202 whether or not the account exists. */
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    description: 'A new code was emailed, if the account exists and is unverified.',
  })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  resendVerification(@Body() { email }: ResendVerificationDto): Promise<void> {
    return this.auth.resendVerification(email);
  }

  /** Sign in with email and password. */
  @Public()
  @Post('sign-in')
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @HttpCode(HttpStatus.OK)
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password.' })
  @ApiForbiddenResponse({
    description: 'Email not verified (`code: email_unverified`); a new verification code was emailed.',
  })
  signIn(@Body() dto: SignInDto): Promise<TokenPairDto> {
    return this.auth.signIn(dto);
  }

  /** Exchange a refresh token for a new token pair. The old refresh token stops working. */
  @Public()
  @Post('refresh')
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @HttpCode(HttpStatus.OK)
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  @ApiUnauthorizedResponse({
    description: 'Refresh token invalid, expired, or already used (reuse also revokes every token of that sign-in).',
  })
  refresh(@Body() { refreshToken }: RefreshTokenDto): Promise<TokenPairDto> {
    return this.auth.refresh(refreshToken);
  }

  /** Sign out this device: revokes the refresh token and the access token sent with the request. */
  @SkipThrottle()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Signed out.' })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked access token.',
  })
  signOut(@Body() { refreshToken }: RefreshTokenDto, @CurrentSession() claims: JwtClaims): Promise<void> {
    return this.auth.signOut(refreshToken, claims);
  }

  /** The signed-in user. */
  @SkipThrottle()
  @Get('me')
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked access token.',
  })
  me(@CurrentUser() user: User): Promise<MeView> {
    return this.view(user);
  }

  /** Update any of `fullName`, `dateOfBirth` and `timezone` (which the app syncs from the device). */
  @Patch('me')
  @ApiBearerAuth()
  @ApiBadRequestResponse({
    description: 'Unknown field, blank name, a date of birth not in the past, or not an IANA timezone.',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked access token.',
  })
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateMeDto): Promise<MeView> {
    if (dto.dateOfBirth !== undefined && !isPlausibleBirthDate(dto.dateOfBirth)) {
      throw new BadRequestException('dateOfBirth must be a past date');
    }
    return this.view(await this.users.updateProfile(user.id, dto));
  }

  /** Change the password. Every device is signed out; the returned pair keeps this one signed in. */
  @Put('me/password')
  @ApiBearerAuth()
  @ApiBadRequestResponse({ description: 'Invalid body, or a new password not 8–128 characters.' })
  @ApiForbiddenResponse({ description: 'Current password is wrong (`code: WRONG_PASSWORD`).' })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked access token.',
  })
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto): Promise<TokenPairDto> {
    return this.auth.changePassword(user.id, dto);
  }

  /** Delete the account (soft delete), after confirming the password. Every token stops working; the email can sign up again. */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Account deleted.' })
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  @ApiForbiddenResponse({ description: 'Password is wrong (`code: WRONG_PASSWORD`).' })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked access token.',
  })
  deleteAccount(
    @CurrentUser() user: User,
    @Body() { password }: DeleteAccountDto,
    @CurrentSession() claims: JwtClaims,
  ): Promise<void> {
    return this.auth.deleteAccount(user.id, password, claims);
  }

  /**
   * Step 1 of changing the profile photo: a signed URL to `PUT` a JPEG (at most 2 MB, `Content-Type: image/jpeg`)
   * straight to S3, valid 5 minutes. Then send its `key` to `PUT /auth/me/avatar`.
   */
  @Post('me/avatar/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked access token.',
  })
  async avatarUploadUrl(@CurrentUser() user: User): Promise<AvatarUploadDto> {
    // A new key per upload, so signed URLs (and image caches keyed on them) never serve an old photo.
    const key = `avatars/${user.id}/${randomUUID()}.jpg`;
    return {
      key,
      uploadUrl: await this.storage.uploadUrl(key, 'image/jpeg', AVATAR_UPLOAD_TTL),
      maxBytes: AVATAR_MAX_BYTES,
    };
  }

  /** Step 2: make the uploaded photo the profile photo. The object is checked (owner, size, JPEG) before it is used. */
  @Put('me/avatar')
  @ApiBearerAuth()
  @ApiBadRequestResponse({
    description: 'Key not issued to this user, not uploaded, over 2 MB, or not a JPEG.',
  })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiUnauthorizedResponse({
    description: 'Missing, invalid, expired or revoked access token.',
  })
  async setAvatar(@CurrentUser() user: User, @Body() { key }: SetAvatarDto): Promise<MeView> {
    if (!key.startsWith(`avatars/${user.id}/`)) throw new BadRequestException('Unknown avatar upload');
    if (key === user.avatarKey) return this.view(user);
    const size = await this.storage.size(key);
    if (size === null) throw new BadRequestException('Avatar was not uploaded');
    // A signed PUT cannot cap the size, so an oversized or non-JPEG upload is caught (and removed) here.
    if (size > AVATAR_MAX_BYTES || !isJpeg(await this.storage.readStart(key, 3))) {
      await this.storage.delete(key).catch(() => undefined);
      throw new BadRequestException('Avatar must be a JPEG of at most 2 MB');
    }
    await this.users.updateAvatarKey(user.id, key);
    // An orphaned old photo is harmless; never fail the change over it.
    if (user.avatarKey) await this.storage.delete(user.avatarKey).catch(() => undefined);
    return this.view({ ...user, avatarKey: key });
  }
}
