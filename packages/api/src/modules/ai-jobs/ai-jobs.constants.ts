export const AI_JOBS_QUEUE = 'ai.jobs';
export const AI_JOBS_DLQ = 'ai.jobs.dlq';
export const AI_JOBS_CLIENT = 'AI_JOBS_CLIENT';

/** Shared by the consumer (main.ts) and the publisher: RabbitMQ rejects a re-declare with different arguments. */
export const aiJobsQueue = (url: string) => ({
  urls: [url],
  queue: AI_JOBS_QUEUE,
  queueOptions: {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': AI_JOBS_DLQ },
  },
});

/** Server-side options for `connectMicroservice` (manual ack, prefetch 4). */
export const aiJobsConsumerOptions = (url: string) => ({ ...aiJobsQueue(url), noAck: false, prefetchCount: 4 });
