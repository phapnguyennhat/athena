import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { ApiBadRequestResponse, ApiBearerAuth, ApiNotFoundResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { User } from '../users/user.entity.js';
import { StartRequestDto } from './dto/learning-path.dto.js';
import { LearningPathsService, type LearningPathView } from './learning-paths.service.js';

@ApiTags('learning-paths')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked access token.' })
@Controller('learning-paths')
export class LearningPathsController {
  constructor(private readonly paths: LearningPathsService) {}

  @Get(':id')
  @ApiNotFoundResponse({ description: 'PATH_NOT_FOUND: no such path for this user.' })
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<LearningPathView> {
    return this.paths.get(user.id, id);
  }

  /** Accept the reviewed draft: it becomes an active path and its conversation is closed. */
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'PATH_NOT_FOUND: no such path for this user.' })
  @ApiBadRequestResponse({ description: 'Invalid edited modules.' })
  start(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StartRequestDto): Promise<LearningPathView> {
    return this.paths.start(user.id, id, dto.modules);
  }
}
