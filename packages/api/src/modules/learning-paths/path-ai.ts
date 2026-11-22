import type { ChatOutput, ChatTurnInput, PathOutput } from './ai-output.js';
import type { Preferences } from './dto/learning-path.dto.js';
import type {
  LessonInput,
  LessonOutput,
  QuizInput,
  QuizOutput,
} from '../lessons/lesson-output.js';

export type { ChatOutput, ChatTurnInput, PathOutput };

/** The AI seam. Implementations return validated output (Gemini output goes through ai-output.ts / lesson-output.ts). */
export abstract class PathAi {
  abstract chat(input: ChatTurnInput): Promise<ChatOutput>;
  abstract generate(p: Preferences): Promise<PathOutput>;
  abstract lesson(input: LessonInput): Promise<LessonOutput>;
  abstract quiz(input: QuizInput): Promise<QuizOutput>;
}
