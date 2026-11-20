import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiError } from '../learning-paths/ai-output.js';
import type { AiJob } from './ai-job.entity.js';
import { AiJobsService } from './ai-jobs.service.js';

const queued = () => ({
  id: 'job-1',
  userId: 'u1',
  type: 'generate_path',
  status: 'queued',
  input: { conversationId: 'c1' },
  resultId: null,
  errorCode: null,
  attempts: 0,
});

function setup(job: object | null = queued()) {
  const repo = {
    findOneBy: vi.fn().mockResolvedValue(job),
    findOne: vi.fn(),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    create: vi.fn((x: object) => x),
    save: vi.fn(),
    find: vi.fn().mockResolvedValue([]),
  };
  const client = { emit: vi.fn(() => of(undefined)) };
  const handler = { type: 'generate_path' as const, run: vi.fn() };
  const svc = new AiJobsService(repo as never, client as never, [handler]);
  const statuses: string[] = [];
  svc.onStatusChange = vi.fn((j: AiJob) => void statuses.push(j.status));
  return { repo, client, handler, svc, statuses };
}

describe('AiJobsService.process', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('process succeeds: queued → running → succeeded with resultId, onStatusChange called twice', async () => {
    const { repo, handler, svc, statuses } = setup();
    handler.run.mockResolvedValue('path-1');
    await svc.process('job-1');
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'job-1', status: 'queued' },
      expect.objectContaining({ status: 'running' }),
    );
    expect(repo.update).toHaveBeenLastCalledWith('job-1', {
      status: 'succeeded',
      resultId: 'path-1',
      errorCode: null,
    });
    expect(statuses).toEqual(['running', 'succeeded']);
  });

  it('process retries a transient AiError and succeeds on attempt 3', async () => {
    const { handler, svc, statuses } = setup();
    handler.run
      .mockRejectedValueOnce(new AiError('AI_UNAVAILABLE', true))
      .mockRejectedValueOnce(new AiError('AI_UNAVAILABLE', true))
      .mockResolvedValueOnce('path-1');
    const done = svc.process('job-1');
    await vi.advanceTimersByTimeAsync(1999);
    expect(handler.run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(handler.run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(7999);
    expect(handler.run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(handler.run).toHaveBeenCalledTimes(3);
    expect(statuses).toEqual(['running', 'succeeded']);
  });

  it('process fails with AI_UNAVAILABLE after 3 transient errors', async () => {
    const { repo, handler, svc, statuses } = setup();
    handler.run.mockRejectedValue(new AiError('AI_UNAVAILABLE', true));
    const done = svc.process('job-1');
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(handler.run).toHaveBeenCalledTimes(3);
    expect(repo.update).toHaveBeenLastCalledWith('job-1', {
      status: 'failed',
      errorCode: 'AI_UNAVAILABLE',
    });
    expect(statuses).toEqual(['running', 'failed']);
  });

  it('process retries AI_INVALID_OUTPUT once then fails with AI_INVALID_OUTPUT', async () => {
    const { repo, handler, svc } = setup();
    handler.run.mockRejectedValue(new AiError('AI_INVALID_OUTPUT', false));
    const done = svc.process('job-1');
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(handler.run).toHaveBeenCalledTimes(2);
    expect(repo.update).toHaveBeenLastCalledWith('job-1', {
      status: 'failed',
      errorCode: 'AI_INVALID_OUTPUT',
    });
  });

  it('process fails immediately with TOPIC_REJECTED (no retry)', async () => {
    const { repo, handler, svc } = setup();
    handler.run.mockRejectedValue(new AiError('TOPIC_REJECTED', false));
    await svc.process('job-1');
    expect(handler.run).toHaveBeenCalledTimes(1);
    expect(repo.update).toHaveBeenLastCalledWith('job-1', {
      status: 'failed',
      errorCode: 'TOPIC_REJECTED',
    });
  });

  it('process skips a job that is not queued', async () => {
    const { repo, handler, svc } = setup({ ...queued(), status: 'running' });
    await svc.process('job-1');
    expect(handler.run).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
    expect(svc.onStatusChange).not.toHaveBeenCalled();
  });

  it('process skips a job another delivery already claimed', async () => {
    const { repo, handler, svc } = setup();
    repo.update.mockResolvedValueOnce({ affected: 0 });
    await svc.process('job-1');
    expect(handler.run).not.toHaveBeenCalled();
  });
});

describe('AiJobsService.enqueue', () => {
  it('enqueue returns the active job instead of creating a second', async () => {
    const { repo, client, svc } = setup();
    const active = { ...queued(), id: 'active-job', status: 'running' };
    repo.save.mockRejectedValue(
      Object.assign(new Error('dup'), { driverError: { code: '23505' } }),
    );
    repo.findOne.mockResolvedValue(active);
    const job = await svc.enqueue('u1', 'generate_path', {
      conversationId: 'c1',
    });
    expect(job).toBe(active);
    expect(client.emit).not.toHaveBeenCalled();
  });

  it('publishes { jobId } after inserting a new job', async () => {
    const { repo, client, svc } = setup();
    repo.save.mockResolvedValue({ ...queued(), id: 'new-job' });
    const job = await svc.enqueue('u1', 'generate_path', {
      conversationId: 'c1',
    });
    expect(job.id).toBe('new-job');
    expect(client.emit).toHaveBeenCalledWith('ai.job', { jobId: 'new-job' });
  });
});
