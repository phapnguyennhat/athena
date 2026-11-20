import type {
  ChatMessageDto,
  ChatReply,
  PreferencesDto,
} from './dto/learning-path.dto.js';
import type { LearningPath } from './dto/learning-path.dto.js';

/** The AI seam. Replace StubPathAi with a Gemini-backed implementation; the HTTP contract stays as is. */
export abstract class PathAi {
  abstract chat(
    messages: ChatMessageDto[],
    preferences: PreferencesDto,
  ): Promise<ChatReply>;
  abstract generate(
    preferences: PreferencesDto,
  ): Promise<Omit<LearningPath, 'id' | 'status'>>;
}
