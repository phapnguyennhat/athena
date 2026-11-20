import { Body, ConflictException, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle, hours, minutes } from '@nestjs/throttler';
import { UserThrottlerGuard } from '../../common/user-throttler.guard.js';
import { AiJobsService, toJobView, type JobView } from '../ai-jobs/ai-jobs.service.js';
import { User } from '../users/user.entity.js';
import { ConversationsService, type ConversationView } from './conversations.service.js';
import { SendMessageDto } from './dto/learning-path.dto.js';

@ApiTags('learning-paths')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked access token.' })
@Controller('learning-paths/conversations')
@UseGuards(UserThrottlerGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly jobs: AiJobsService,
  ) {}

  /** The user's open conversation with its messages. */
  @Get('current')
  @ApiNotFoundResponse({ description: 'No open conversation.' })
  async current(@CurrentUser() user: User): Promise<ConversationView> {
    const view = await this.conversations.current(user.id);
    if (!view) throw new NotFoundException({ statusCode: 404, code: 'CONVERSATION_NOT_FOUND', message: 'No open conversation.' });
    return view;
  }

  /** Start over: closes the open conversation (deleting its draft) and opens a new one with the greeting. */
  @Post()
  start(@CurrentUser() user: User): Promise<ConversationView> {
    return this.conversations.startOver(user.id);
  }

  /** One chat turn. */
  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: minutes(1) } })
  @ApiBadRequestResponse({ description: 'Invalid body.' })
  @ApiNotFoundResponse({ description: 'Not the user\'s conversation.' })
  @ApiConflictResponse({ description: 'CONVERSATION_CLOSED, CONVERSATION_LIMIT or TURN_IN_PROGRESS.' })
  @ApiTooManyRequestsResponse({ description: 'More than 20 messages a minute.' })
  @ApiServiceUnavailableResponse({ description: 'AI_UNAVAILABLE.' })
  send(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.conversations.sendMessage(user.id, id, dto.content);
  }

  /** Queue path generation. Idempotent: while a job for this conversation is active, that job is returned. */
  @Post(':id/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: hours(1) } })
  @ApiNotFoundResponse({ description: "Not the user's conversation." })
  @ApiConflictResponse({ description: 'CONVERSATION_CLOSED or NOT_READY.' })
  @ApiTooManyRequestsResponse({ description: 'More than 5 generations an hour.' })
  @ApiServiceUnavailableResponse({ description: 'QUEUE_UNAVAILABLE.' })
  async generate(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<JobView> {
    const conv = await this.conversations.getOpenForUser(user.id, id);
    if (!conv.ready)
      throw new ConflictException({ statusCode: 409, code: 'NOT_READY', message: 'The conversation does not have enough information yet.' });
    return toJobView(await this.jobs.enqueue(user.id, 'generate_path', { conversationId: conv.id }));
  }
}
