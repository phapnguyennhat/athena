import { ApiError, type GenerateContentConfig, type GoogleGenAI } from '@google/genai';
import {
  AiError,
  normalizeCategorized,
  validateChatOutput,
  validatePathOutput,
  type Categorized,
  type CategorizeInput,
  type ChatOutput,
  type ChatTurnInput,
  type PathOutput,
} from './ai-output.js';
import type { Preferences } from './dto/learning-path.dto.js';
import { PathAi } from './path-ai.js';
import {
  validateLessonOutput,
  validateQuizOutput,
  type LessonInput,
  type LessonOutput,
  type QuizInput,
  type QuizOutput,
} from '../lessons/lesson-output.js';
import {
  CATEGORIZE_SCHEMA,
  CATEGORIZE_SYSTEM,
  CHAT_SCHEMA,
  CHAT_SYSTEM,
  GENERATE_SYSTEM,
  LESSON_SCHEMA,
  LESSON_SYSTEM,
  PATH_SCHEMA,
  QUIZ_SCHEMA,
  QUIZ_SYSTEM,
  toContents,
} from './prompts.js';

const TIMEOUT_MS = 30_000;
// Lessons and quizzes are long outputs: a 30 s / 2000-token budget truncates them into invalid JSON.
const LONG_TIMEOUT_MS = 90_000;
// Flash models think by default and thinking tokens count against maxOutputTokens.
const NO_THINKING = { thinkingBudget: 0 };

export class GeminiPathAi extends PathAi {
  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string,
  ) {
    super();
  }

  async chat(input: ChatTurnInput): Promise<ChatOutput> {
    return validateChatOutput(
      await this.call(toContents(input), {
        systemInstruction: CHAT_SYSTEM,
        temperature: 0.4,
        maxOutputTokens: 400,
        thinkingConfig: NO_THINKING,
        responseSchema: CHAT_SCHEMA,
      }),
    );
  }

  async generate(p: Preferences, categories: string[]): Promise<PathOutput> {
    return validatePathOutput(
      await this.call(JSON.stringify({ ...p, categories }), {
        systemInstruction: GENERATE_SYSTEM,
        temperature: 0.6,
        maxOutputTokens: 2000,
        thinkingConfig: NO_THINKING,
        responseSchema: PATH_SCHEMA,
      }),
    );
  }

  async categorize(input: CategorizeInput, categories: string[]): Promise<Categorized> {
    return normalizeCategorized(
      await this.call(JSON.stringify({ ...input, categories }), {
        systemInstruction: CATEGORIZE_SYSTEM,
        temperature: 0.2,
        maxOutputTokens: 300,
        thinkingConfig: NO_THINKING,
        responseSchema: CATEGORIZE_SCHEMA,
      }),
    );
  }

  async lesson(input: LessonInput): Promise<LessonOutput> {
    return validateLessonOutput(
      await this.call(
        JSON.stringify(input),
        {
          systemInstruction: LESSON_SYSTEM,
          temperature: 0.5,
          maxOutputTokens: 6000,
          thinkingConfig: NO_THINKING,
          responseSchema: LESSON_SCHEMA,
        },
        LONG_TIMEOUT_MS,
      ),
    );
  }

  async quiz(input: QuizInput): Promise<QuizOutput> {
    return validateQuizOutput(
      await this.call(
        JSON.stringify(input),
        {
          systemInstruction: QUIZ_SYSTEM,
          temperature: 0.4,
          maxOutputTokens: 3000,
          thinkingConfig: NO_THINKING,
          responseSchema: QUIZ_SCHEMA,
        },
        LONG_TIMEOUT_MS,
      ),
    );
  }

  private async call(
    contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'],
    config: GenerateContentConfig,
    timeoutMs = TIMEOUT_MS,
  ): Promise<unknown> {
    const ctrl = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new AiError('AI_UNAVAILABLE', true));
      }, timeoutMs);
    });
    try {
      const res = await Promise.race([
        this.client.models.generateContent({
          model: this.model,
          contents,
          config: {
            ...config,
            responseMimeType: 'application/json',
            abortSignal: ctrl.signal,
          },
        }),
        timeout,
      ]);
      if (!res.text) throw new AiError('AI_INVALID_OUTPUT', false);
      try {
        return JSON.parse(res.text);
      } catch {
        throw new AiError('AI_INVALID_OUTPUT', false);
      }
    } catch (e) {
      if (e instanceof AiError) throw e;
      // SDK status errors: only 429/5xx are worth retrying; anything else (network, abort) is transient.
      const transient = !(e instanceof ApiError) || e.status === 429 || e.status >= 500;
      throw new AiError('AI_UNAVAILABLE', transient);
    } finally {
      clearTimeout(timer);
    }
  }
}
