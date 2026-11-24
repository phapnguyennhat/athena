import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module.js';
import { CommunityController } from './community.controller.js';
import { CommunityService } from './community.service.js';

@Module({
  imports: [SearchModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
