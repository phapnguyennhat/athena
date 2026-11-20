import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { ApiBearerAuth, ApiNotFoundResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { User } from '../users/user.entity.js';
import { AiJobsService, toJobView, type JobView } from './ai-jobs.service.js';

@ApiTags('jobs')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or revoked access token.' })
@Controller('jobs')
export class AiJobsController {
  constructor(private readonly jobs: AiJobsService) {}

  /** Status of one of the user's AI jobs; `resultId` is set once it succeeded. */
  @Get(':id')
  @ApiNotFoundResponse({ description: "JOB_NOT_FOUND: not the user's job." })
  async get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string): Promise<JobView> {
    return toJobView(await this.jobs.findForUser(user.id, id));
  }
}
