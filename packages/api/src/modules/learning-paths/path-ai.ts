import type {
  ChatOutput,
  ChatTurnInput,
  PathOutput,
} from './ai-output.js';
import type { Preferences } from './dto/learning-path.dto.js';

export type { ChatOutput, ChatTurnInput, PathOutput };

/** The AI seam. Implementations return unvalidated-shape-safe output (Gemini output goes through ai-output.ts). */
export abstract class PathAi {
  abstract chat(input: ChatTurnInput): Promise<ChatOutput>;
  abstract generate(p: Preferences): Promise<PathOutput>;
}
