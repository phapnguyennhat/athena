import type { Categorized, CategorizeInput, ChatOutput, ChatTurnInput, PathOutput } from './ai-output.js';
import type { Preferences } from './dto/learning-path.dto.js';
import type { LessonInput, LessonOutput, QuizInput, QuizOutput } from '../lessons/lesson-output.js';

export type { Categorized, CategorizeInput, ChatOutput, ChatTurnInput, PathOutput };

/** The AI seam. Implementations return validated output (Gemini output goes through ai-output.ts / lesson-output.ts). */
export abstract class PathAi {
  abstract chat(input: ChatTurnInput): Promise<ChatOutput>;
  /** `categories`: existing category names the model should pick from. */
  abstract generate(p: Preferences, categories: string[]): Promise<PathOutput>;
  abstract categorize(input: CategorizeInput, categories: string[]): Promise<Categorized>;
  abstract lesson(input: LessonInput): Promise<LessonOutput>;
  abstract quiz(input: QuizInput): Promise<QuizOutput>;
}
