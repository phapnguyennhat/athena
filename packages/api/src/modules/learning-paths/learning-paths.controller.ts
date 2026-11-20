import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { User } from '../users/user.entity.js';
import {
  ChatRequestDto,
  GenerateRequestDto,
  StartRequestDto,
  type ChatReply,
  type LearningPath,
} from './dto/learning-path.dto.js';
import { LearningPathsService } from './learning-paths.service.js';

@ApiTags('learning-paths')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, expired or revoked access token.',
})
@Controller('learning-paths')
export class LearningPathsController {
  constructor(private readonly paths: LearningPathsService) {}

  /** One chat turn: free text in, a reply, quick replies and the preferences extracted so far out. */
  @Post('chat')
  @HttpCode(HttpStatus.OK)
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  chat(@Body() dto: ChatRequestDto): Promise<ChatReply> {
    return this.paths.chat(dto);
  }

  /** Generate a draft path from the preferences. Slow once a real model is behind it. */
  @Post('generate')
  @ApiBadRequestResponse({
    description: 'Invalid body, or topic/level missing.',
  })
  generate(
    @CurrentUser() user: User,
    @Body() dto: GenerateRequestDto,
  ): Promise<LearningPath> {
    return this.paths.generate(user.id, dto.preferences);
  }

  /** Accept the reviewed draft: it becomes an active path. */
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiNotFoundResponse({ description: 'No such path for this user.' })
  @ApiBadRequestResponse({ description: 'Invalid edited modules.' })
  start(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartRequestDto,
  ): LearningPath {
    return this.paths.start(user.id, id, dto.modules);
  }
}
