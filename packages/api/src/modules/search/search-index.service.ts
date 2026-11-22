import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { DataSource } from 'typeorm';
import { Errors, type Client, type CollectionCreateSchema } from 'typesense';
import { PUBLIC_PATH } from '../community/public-path.js';
import { collectionName, SEARCH_CLIENT, TYPESENSE } from './search.constants.js';

const PUBLISH_TIMEOUT_MS = 5000;

type PathDoc = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  category_id?: string;
  category_name?: string;
  level?: string;
  lesson_count: number;
  copies: number;
  created_at: number;
  title_plain: string;
  tags_plain: string[];
};

// Typesense folds diacritics ("nau an" finds "Nấu ăn") but not đ, which is a letter of its own.
const plain = (s: string) => s.replace(/đ/g, 'd').replace(/Đ/g, 'D');

const schema = (name: string): CollectionCreateSchema => ({
  name,
  fields: [
    { name: 'title', type: 'string' },
    { name: 'summary', type: 'string' },
    { name: 'tags', type: 'string[]', facet: true },
    { name: 'category_id', type: 'string', facet: true, optional: true },
    { name: 'category_name', type: 'string', optional: true },
    { name: 'level', type: 'string', facet: true, optional: true },
    { name: 'lesson_count', type: 'int32' },
    { name: 'copies', type: 'int32', sort: true },
    { name: 'created_at', type: 'int64', sort: true },
    { name: 'title_plain', type: 'string' },
    { name: 'tags_plain', type: 'string[]' },
  ],
});

/** Keeps the Typesense collection of public paths (active originals) in step with Postgres, which stays the truth. */
@Injectable()
export class SearchIndexService implements OnApplicationBootstrap {
  private readonly log = new Logger(SearchIndexService.name);
  private readonly name = collectionName();

  constructor(
    private readonly ds: DataSource,
    @Inject(TYPESENSE) private readonly ts: Client,
    @Inject(SEARCH_CLIENT) private readonly client: ClientProxy,
  ) {}

  // The app boots without Typesense: search answers 503 meanwhile and `pnpm search:reindex` rebuilds.
  onApplicationBootstrap() {
    return this.ensureCollection().catch((e: unknown) => this.log.error(`ensureCollection failed: ${String(e)}`));
  }

  async ensureCollection(): Promise<void> {
    try {
      await this.ts.collections().create(schema(this.name));
    } catch (e) {
      if (!(e instanceof Errors.ObjectAlreadyExists)) throw e;
    }
  }

  /** Queues a re-sync of one path after its DB commit. Never throws: a lost message is fixed by a reindex. */
  async publish(pathId: string): Promise<void> {
    try {
      await lastValueFrom(this.client.emit('search.index', { pathId }).pipe(timeout(PUBLISH_TIMEOUT_MS)), {
        defaultValue: undefined,
      });
    } catch (e) {
      this.log.error(`search publish of path ${pathId} failed: ${String(e)}`);
    }
  }

  /** Idempotent and order-independent: upserts the path if it is public, otherwise deletes its document. */
  async sync(pathId: string): Promise<'upserted' | 'deleted'> {
    const [doc] = await this.docs(pathId);
    if (doc) {
      await this.documents().upsert(doc);
      return 'upserted';
    }
    try {
      await this.ts.collections(this.name).documents(pathId).delete();
    } catch (e) {
      if (!(e instanceof Errors.ObjectNotFound)) throw e;
    }
    return 'deleted';
  }

  /** Upserts every public path, then drops documents that are no longer public. Returns the public path count. */
  async reindexAll(): Promise<number> {
    await this.ensureCollection();
    const docs = await this.docs(null);
    if (docs.length) await this.documents().import(docs, { action: 'upsert' });
    const live = new Set(docs.map((d) => d.id));
    const indexed = (await this.documents().export({ include_fields: 'id' })).split('\n').filter(Boolean);
    for (const line of indexed) {
      const { id } = JSON.parse(line) as { id: string };
      if (!live.has(id)) await this.ts.collections(this.name).documents(id).delete();
    }
    return docs.length;
  }

  async search(params: { q?: string; categoryId?: string; tag?: string; limit: number }): Promise<{ ids: string[] }> {
    // Backticks quote a filter value in Typesense; one inside the value cannot be escaped.
    const filters = [
      params.categoryId && `category_id:=\`${params.categoryId.replace(/`/g, '')}\``,
      params.tag && `tags:=\`${params.tag.replace(/`/g, '')}\``,
    ].filter(Boolean);
    const res = await this.documents().search({
      q: params.q?.trim() || '*',
      query_by: 'title,tags,summary,title_plain,tags_plain',
      query_by_weights: '4,2,1,4,2',
      filter_by: filters.join(' && ') || undefined,
      sort_by: 'copies:desc,created_at:desc',
      per_page: params.limit,
      include_fields: 'id',
    });
    return { ids: (res.hits ?? []).map((h) => h.document.id) };
  }

  async categoryFacets(): Promise<{ id: string; count: number }[]> {
    const res = await this.documents().search({
      q: '*',
      query_by: 'title',
      facet_by: 'category_id',
      max_facet_values: 100,
      per_page: 0,
    });
    return (res.facet_counts?.[0]?.counts ?? []).map((c) => ({ id: c.value, count: c.count }));
  }

  private documents() {
    return this.ts.collections<PathDoc>(this.name).documents();
  }

  /** Documents for one path (empty when not public), or for every public path when `pathId` is null. */
  private async docs(pathId: string | null): Promise<PathDoc[]> {
    const rows: (Omit<PathDoc, 'title_plain' | 'tags_plain'> & { [k: string]: unknown })[] = await this.ds.query(
      `SELECT p.id, p.title, p.summary, p.tags, p.category_id, c.name AS category_name,
         p.preferences->>'level' AS level,
         (SELECT count(*)::int FROM path_lessons l JOIN path_modules m ON m.id = l.module_id
          WHERE m.path_id = p.id) AS lesson_count,
         (SELECT count(*)::int FROM learning_paths cp WHERE cp.source_path_id = p.id) AS copies,
         floor(extract(epoch FROM p.created_at))::float8 AS created_at
       FROM learning_paths p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${PUBLIC_PATH} AND ($1::uuid IS NULL OR p.id = $1)`,
      [pathId],
    );
    return rows.map((r) => {
      // Typesense rejects null for optional fields; leave them out instead.
      const doc = Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null)) as PathDoc;
      return { ...doc, title_plain: plain(doc.title), tags_plain: doc.tags.map(plain) };
    });
  }
}
