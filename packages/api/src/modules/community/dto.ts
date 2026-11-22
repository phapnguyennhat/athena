import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { Level } from '../learning-paths/dto/learning-path.dto.js';

export class ListCommunityPathsDto {
  /** Search text; empty lists everything. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Category id. */
  @IsOptional() @IsUUID() category?: string;

  /** Exact tag. */
  @IsOptional() @IsString() @MaxLength(100) tag?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number = 20;
}

export class RecommendationsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit: number = 10;
}

/** A public course as anyone sees it: never its author or the author's goal. */
export type CommunityPath = {
  id: string;
  title: string;
  summary: string;
  category: { id: string; name: string } | null;
  tags: string[];
  level: Level | null;
  moduleCount: number;
  lessonCount: number;
  copies: number;
  /** The caller's copy of it, if any. */
  copiedPathId: string | null;
};

export type CommunityPathDetail = CommunityPath & { modules: { title: string; lessons: { title: string }[] }[] };

export type CommunityCategory = { id: string; name: string; count: number };
