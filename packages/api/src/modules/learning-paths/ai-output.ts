import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsString,
  MaxLength,
  validateSync,
  ValidateNested,
} from 'class-validator';
import { FALLBACK_CATEGORY, slugify } from './categories.js';
import { PreferencesDto, type Preferences } from './dto/learning-path.dto.js';

export type ChatTurnInput = {
  history: { role: 'user' | 'assistant'; content: string }[];
  preferences: Preferences;
};
export type ChatOutput = {
  reply: string;
  quickReplies: string[];
  preferences: Preferences;
  ready: boolean;
  offTopic: boolean;
};
/** Category name (existing or new, Vietnamese) and lowercase search tags. */
export type Categorized = { category: string; tags: string[] };
export type CategorizeInput = { title: string; summary: string; modules: string[] };

export type PathOutput = Categorized & {
  /** ISO 639-1 code of the learner's input; lessons and quizzes are written in it. */
  language: string;
  title: string;
  summary: string;
  modules: { title: string; lessons: { title: string }[] }[];
};

export class AiError extends Error {
  constructor(
    readonly code: 'AI_UNAVAILABLE' | 'AI_INVALID_OUTPUT' | 'TOPIC_REJECTED',
    readonly transient: boolean,
  ) {
    super(code);
  }
}

const invalid = () => new AiError('AI_INVALID_OUTPUT', false);

class ChatOutputDto {
  @IsString() @IsNotEmpty() @MaxLength(600) reply: string;
  @IsArray() quickReplies: unknown[];
  @IsBoolean() ready: boolean;
  @IsBoolean() offTopic: boolean;
}

class LessonOut {
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
}
class ModuleOut {
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => LessonOut)
  lessons: LessonOut[];
}
class PathOutDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsString() @IsNotEmpty() @MaxLength(400) summary: string;
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ModuleOut)
  modules: ModuleOut[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateChatOutput(raw: unknown): ChatOutput {
  if (!isObject(raw)) throw invalid();
  const { preferences: rawPrefs, ...rest } = raw;
  const dto = plainToInstance(ChatOutputDto, rest);
  if (validateSync(dto, { whitelist: true }).length) throw invalid();

  // A bad preference field is dropped alone; the turn still counts.
  const prefs = plainToInstance(PreferencesDto, isObject(rawPrefs) ? rawPrefs : {});
  for (const e of validateSync(prefs, { whitelist: true })) delete (prefs as Record<string, unknown>)[e.property];
  return {
    reply: dto.reply,
    // Small overruns are repaired, not failed: drop bad chips, keep the first 4.
    quickReplies: dto.quickReplies
      .filter((q): q is string => typeof q === 'string' && q.trim() !== '' && q.length <= 40)
      .slice(0, 4),
    ready: dto.ready,
    offTopic: dto.offTopic,
    preferences: { ...prefs },
  };
}

/** Cleans the model's category and tags. Never throws: a bad category is not worth failing a path over. */
export function normalizeCategorized(raw: unknown): Categorized {
  const r = isObject(raw) ? raw : {};
  const name = typeof r.category === 'string' ? r.category.replace(/\s+/g, ' ').trim() : '';
  const tags = Array.isArray(r.tags)
    ? r.tags.filter((t): t is string => typeof t === 'string').map((t) => t.replace(/\s+/g, ' ').trim().toLowerCase())
    : [];
  return {
    category: name.length <= 60 && slugify(name) ? name : FALLBACK_CATEGORY,
    tags: [...new Set(tags.filter((t) => t && t.length <= 40))].slice(0, 5),
  };
}

export function validatePathOutput(raw: unknown): PathOutput {
  if (isObject(raw) && raw.rejected === true) throw new AiError('TOPIC_REJECTED', false);
  const dto = plainToInstance(PathOutDto, raw);
  if (!isObject(raw) || validateSync(dto, { whitelist: true }).length) throw invalid();
  const lang = typeof raw.language === 'string' ? raw.language.toLowerCase() : '';
  return {
    // An unusable code is not worth failing a path over: fall back to the app language.
    language: /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(lang) ? lang : 'vi',
    title: dto.title,
    summary: dto.summary,
    ...normalizeCategorized(raw),
    modules: dto.modules.map((m) => ({
      title: m.title,
      lessons: m.lessons.map((l) => ({ title: l.title })),
    })),
  };
}

/** The model's `ready` is advisory: the server also requires every mandatory field. */
export const serverReady = (out: ChatOutput): boolean =>
  out.ready && !!out.preferences.topic && !!out.preferences.level;
