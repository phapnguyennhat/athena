import { ApiError, type GenerateContentConfig, type GoogleGenAI } from '@google/genai';
import { AiError, validateChatOutput, validatePathOutput, type ChatOutput, type ChatTurnInput, type PathOutput } from './ai-output.js';
import type { Preferences } from './dto/learning-path.dto.js';
import { PathAi } from './path-ai.js';
import { CHAT_SCHEMA, CHAT_SYSTEM, GENERATE_SYSTEM, PATH_SCHEMA, toContents } from './prompts.js';

const TIMEOUT_MS = 30_000;
// 2.5 models think by default and thinking tokens count against maxOutputTokens.
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

  async generate(p: Preferences): Promise<PathOutput> {
    return validatePathOutput(
      await this.call(JSON.stringify(p), {
        systemInstruction: GENERATE_SYSTEM,
        temperature: 0.6,
        maxOutputTokens: 2000,
        thinkingConfig: NO_THINKING,
        responseSchema: PATH_SCHEMA,
      }),
    );
  }

  private async call(contents: Parameters<GoogleGenAI['models']['generateContent']>[0]['contents'], config: GenerateContentConfig): Promise<unknown> {
    const ctrl = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctrl.abort();
        reject(new AiError('AI_UNAVAILABLE', true));
      }, TIMEOUT_MS);
    });
    try {
      const res = await Promise.race([
        this.client.models.generateContent({
          model: this.model,
          contents,
          config: { ...config, responseMimeType: 'application/json', abortSignal: ctrl.signal },
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
