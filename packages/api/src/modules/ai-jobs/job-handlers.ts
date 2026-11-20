import type { AiJob } from './ai-job.entity.js';

export const JOB_HANDLERS = Symbol('JOB_HANDLERS');

export type JobHandler = {
  type: AiJob['type'];
  /** Returns the id of the created result. */
  run(job: AiJob): Promise<string>;
};

/** A handler's non-retryable failure with a client-facing error code (e.g. CONVERSATION_CLOSED). */
export class JobError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
