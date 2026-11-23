import { Client } from 'typesense';

export const SEARCH_QUEUE = 'search.index';
export const SEARCH_DLQ = 'search.index.dlq';
export const SEARCH_CLIENT = 'SEARCH_CLIENT';
export const TYPESENSE = 'TYPESENSE';

/** Shared by the consumer (main.ts) and the publisher: RabbitMQ rejects a re-declare with different arguments. */
export const searchQueue = (url: string) => ({
  urls: [url],
  queue: SEARCH_QUEUE,
  queueOptions: {
    durable: true,
    arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': SEARCH_DLQ },
  },
});

/** Server-side options for `connectMicroservice` (manual ack). */
// Prefetch 1: two syncs of one path running at once could finish out of order and write a stale `copies`.
export const searchConsumerOptions = (url: string) => ({ ...searchQueue(url), noAck: false, prefetchCount: 1 });

export const typesenseClient = (url: string, apiKey: string) =>
  new Client({ nodes: [{ url }], apiKey, connectionTimeoutSeconds: 5 });

/** e2e sets its own name so the dev collection is never wiped. */
export const collectionName = () => process.env.TYPESENSE_COLLECTION || 'community_paths';
