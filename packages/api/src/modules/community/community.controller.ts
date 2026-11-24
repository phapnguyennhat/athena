import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { User } from '../users/user.entity.js';
import { CommunityService } from './community.service.js';
import {
  ListCommunityPathsDto,
  RecommendationsDto,
  type CommunityCategory,
  type CommunityPath,
  type CommunityPathDetail,
} from './dto.js';

@ApiTags('community')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked access token.' })
@Controller('community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  /** Public courses, most-copied first, without the caller's own visible ones. */
  @Get('paths')
  @ApiBadRequestResponse({ description: 'Invalid query.' })
  @ApiServiceUnavailableResponse({ description: 'SEARCH_UNAVAILABLE.' })
  async list(@CurrentUser() user: User, @Query() dto: ListCommunityPathsDto): Promise<{ items: CommunityPath[] }> {
    return { items: await this.community.list(user.id, dto) };
  }

  @Get('paths/:id')
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND: no such public course.' })
  detail(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<CommunityPathDetail> {
    return this.community.detail(user.id, id);
  }

  /** 201 with a new copy; 200 with the caller's existing copy (or their own hidden original, un-hidden). */
  @Post('paths/:id/copy')
  @ApiNotFoundResponse({ description: 'COURSE_NOT_FOUND: no such public course, or it is the caller’s own.' })
  @ApiConflictResponse({ description: 'ALREADY_LEARNING, with `pathId`.' })
  async copy(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ id: string }> {
    const { id: copyId, created } = await this.community.copy(user.id, id);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { id: copyId };
  }

  /** Categories with public courses, most courses first. */
  @Get('categories')
  @ApiServiceUnavailableResponse({ description: 'SEARCH_UNAVAILABLE.' })
  categories(): Promise<CommunityCategory[]> {
    return this.community.categories();
  }

  /** Courses in the caller's categories first, then most-copied; never their own or ones they copied. */
  @Get('recommendations')
  @ApiBadRequestResponse({ description: 'Invalid query.' })
  recommendations(@CurrentUser() user: User, @Query() dto: RecommendationsDto): Promise<CommunityPath[]> {
    return this.community.recommendations(user.id, dto.limit);
  }
}
