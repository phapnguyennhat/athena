import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];

/** What the chat has extracted so far. The client echoes it back on every turn. */
export class PreferencesDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) topic?: string;
  @IsOptional() @IsIn(LEVELS) level?: Level;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) goal?: string;
  @IsOptional() @IsInt() @Min(5) @Max(240) dailyMinutes?: number;
}

/** Plain-type view of `PreferencesDto` for entities and services. */
export type Preferences = PreferencesDto;

export class ChatMessageDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @IsNotEmpty() @MaxLength(1000) content: string;
}

export class ChatRequestDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences?: PreferencesDto;
}

export class GenerateRequestDto {
  @ValidateNested()
  @Type(() => PreferencesDto)
  preferences: PreferencesDto;
}

export class LessonDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;
}

export class ModuleDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => LessonDto)
  lessons: LessonDto[];
}

/** Optional edits the user made while reviewing the draft. */
export class StartRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ModuleDto)
  modules?: ModuleDto[];
}

export type ChatReply = {
  reply: string;
  quickReplies: string[];
  preferences: PreferencesDto;
  /** True once the chatbot has everything it needs (required fields plus an answered or skipped goal): the client shows "generate". */
  ready: boolean;
};

export type LearningPath = {
  id: string;
  status: 'draft' | 'active';
  title: string;
  summary: string;
  modules: { title: string; lessons: { title: string }[] }[];
};

export class SendMessageDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 500)
  content: string;
}
