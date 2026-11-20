import { Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap, ServiceUnavailableException } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { lastValueFrom, timeout } from 'rxjs';
import { In, JsonContains, LessThan, Repository } from 'typeorm';
import { AiError } from '../learning-paths/ai-output.js';
import { AiJob } from './ai-job.entity.js';
import { AI_JOBS_CLIENT } from './ai-jobs.constants.js';
import { JOB_HANDLERS, JobError, type JobHandler } from './job-handlers.js';

export type JobView = Pick<AiJob, 'id' | 'type' | 'status' | 'resultId' | 'errorCode'>;
export const toJobView = ({ id, type, status, resultId, errorCode }: AiJob): JobView => ({ id, type, status, resultId, errorCode });

const MAX_ATTEMPTS = 3;
/** Wait before attempt n+1, indexed by the attempt that just failed (1-based). */
const BACKOFF_MS = [0, 2000, 8000];
const STALE_MS = 2 * 60_000;
const PUBLISH_TIMEOUT_MS = 5000;
const ACTIVE = In(['queued', 'running']);

@Injectable()
export class AiJobsService implements OnApplicationBootstrap {
  private readonly log = new Logger(AiJobsService.name);

  /** Status hook, set by the socket gateway. */
  onStatusChange: (job: AiJob) => void = () => {};

  constructor(
    @InjectRepository(AiJob) private readonly jobs: Repository<AiJob>,
    @Inject(AI_JOBS_CLIENT) private readonly client: ClientProxy,
    @Inject(JOB_HANDLERS) private readonly handlers: JobHandler[],
  ) {}

  /** Idempotent per conversation: while a job for it is queued/running, that job is returned. */
  async enqueue(userId: string, type: AiJob['type'], input: { conversationId: string } & Record<string, unknown>): Promise<AiJob> {
    let job: AiJob | undefined;
    // Two tries: the active job that blocked the insert may finish before we read it.
    for (let i = 0; i < 2 && !job; i++) {
      try {
        job = await this.jobs.save(this.jobs.create({ userId, type, input }));
      } catch (e) {
        if ((e as { driverError?: { code?: string } }).driverError?.code !== '23505') throw e;
        const active = await this.jobs.findOne({ where: { type, status: ACTIVE, input: JsonContains({ conversationId: input.conversationId }) } });
        if (active) return active;
      }
    }
    if (!job) throw new Error('could not enqueue job');
    await this.publish(job);
    return job;
  }

  async findForUser(userId: string, id: string): Promise<AiJob> {
    const job = await this.jobs.findOneBy({ id, userId });
    if (!job) throw new NotFoundException({ statusCode: 404, code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    return job;
  }

  async process(jobId: string): Promise<void> {
    const job = await this.jobs.findOneBy({ id: jobId });
    if (job?.status !== 'queued') return;
    // Atomic claim: a redelivered or duplicate message loses here.
    const claim = await this.jobs.update({ id: jobId, status: 'queued' }, { status: 'running', attempts: () => 'attempts + 1' });
    if (claim.affected !== 1) return;
    this.change(job, { status: 'running', attempts: job.attempts + 1 });

    const handler = this.handlers.find((h) => h.type === job.type);
    if (!handler) return this.fail(job, 'INTERNAL');
    let invalidRetried = false;
    for (;;) {
      try {
        const resultId = await handler.run(job);
        await this.jobs.update(job.id, { status: 'succeeded', resultId, errorCode: null });
        return this.change(job, { status: 'succeeded', resultId, errorCode: null });
      } catch (e) {
        if (e instanceof JobError) return this.fail(job, e.code);
        if (!(e instanceof AiError)) throw e;
        const retry =
          job.attempts < MAX_ATTEMPTS && (e.transient || (e.code === 'AI_INVALID_OUTPUT' && !invalidRetried));
        if (!retry) return this.fail(job, e.code);
        if (e.code === 'AI_INVALID_OUTPUT') invalidRetried = true;
        this.log.warn(`job ${job.id} attempt ${job.attempts} failed: ${e.code}; retrying`);
        await new Promise((r) => setTimeout(r, BACKOFF_MS[job.attempts]));
        job.attempts++;
        await this.jobs.update(job.id, { attempts: job.attempts });
      }
    }
  }

  async markFailed(jobId: string, errorCode: string): Promise<void> {
    const job = await this.jobs.findOneBy({ id: jobId });
    if (job && job.status !== 'succeeded' && job.status !== 'failed') await this.fail(job, errorCode);
  }

  onApplicationBootstrap() {
    return this.recoverStale();
  }

  /** Re-publishes jobs left queued/running for over 2 minutes (e.g. the process died mid-job). */
  async recoverStale(): Promise<number> {
    const stale = await this.jobs.find({ where: { status: ACTIVE, updatedAt: LessThan(new Date(Date.now() - STALE_MS)) } });
    for (const job of stale) {
      // process() only picks up queued jobs.
      if (job.status === 'running') await this.jobs.update({ id: job.id, status: 'running' }, { status: 'queued' });
      job.status = 'queued';
      await this.publish(job).catch((e: unknown) => this.log.error(`re-publish of job ${job.id} failed: ${String(e)}`));
    }
    if (stale.length) this.log.log(`re-published ${stale.length} stale job(s)`);
    return stale.length;
  }

  private async publish(job: AiJob) {
    try {
      await lastValueFrom(this.client.emit('ai.job', { jobId: job.id }).pipe(timeout(PUBLISH_TIMEOUT_MS)), { defaultValue: undefined });
    } catch (e) {
      this.log.error(`publish of job ${job.id} failed: ${String(e)}`);
      await this.fail(job, 'QUEUE_UNAVAILABLE');
      throw new ServiceUnavailableException({ statusCode: 503, code: 'QUEUE_UNAVAILABLE', message: 'Could not queue the job. Try again shortly.' });
    }
  }

  private async fail(job: AiJob, errorCode: string) {
    await this.jobs.update(job.id, { status: 'failed', errorCode });
    this.change(job, { status: 'failed', errorCode });
  }

  private change(job: AiJob, patch: Partial<AiJob>) {
    Object.assign(job, patch);
    try {
      this.onStatusChange(job);
    } catch (e) {
      this.log.error(`onStatusChange failed: ${String(e)}`);
    }
  }
}
