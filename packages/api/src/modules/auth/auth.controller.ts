import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
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
import { SignUpDto } from './dto/sign-up.dto.js';
import { TokenPairDto } from './dto/token-pair.dto.js';
import { ResendVerificationDto, VerifyEmailDto } from './dto/verify-email.dto.js';

const TOO_MANY_REQUESTS = { description: 'More than 10 requests a minute from this IP.' };

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Create an account and email a 6-digit verification code. Sign in with `POST /auth/verify-email`. */
  @Public()
  @Post('sign-up')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'Account created; verification code emailed.' })
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiBadRequestResponse({ description: 'Invalid body, unknown field, or a date of birth not in the past.' })
  @ApiConflictResponse({ description: 'Email is already registered.' })
  signUp(@Body() dto: SignUpDto): Promise<void> {
    return this.auth.signUp(dto);
  }

  /** Verify the email with the emailed code, and sign in. */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiTooManyRequestsResponse(TOO_MANY_REQUESTS)
  @ApiBadRequestResponse({
    description: 'Invalid body, or an invalid or expired code (a code allows 5 attempts and lasts 10 minutes).',
  })
  verifyEmail(@Body() dto: VerifyEmailDto): Promise<TokenPairDto> {
    return this.auth.verifyEmail(dto);
  }

  /** Email a new verification code (at most one a minute). Answers 202 whether or not the account exists. */
  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ description: 'A new code was emailed, if the account exists and is unverified.' })
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
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked access token.' })
  signOut(@Body() { refreshToken }: RefreshTokenDto, @CurrentSession() claims: JwtClaims): Promise<void> {
    return this.auth.signOut(refreshToken, claims);
  }

  /** The signed-in user. */
  @SkipThrottle()
  @Get('me')
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked access token.' })
  me(@CurrentUser() user: User): User {
    return user;
  }
}
