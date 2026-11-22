import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type YouTubeVideo = {
  id: string;
  title: string;
  channel: string | null;
  thumbnailUrl: string | null;
};

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const TIMEOUT_MS = 8000;

/**
 * YouTube Data API v3 search. Video ids come from the provider, never from the model (PROJECT_SPEC §5.4).
 * One search.list costs ~100 quota units, so callers search once per lesson and store the result.
 */
@Injectable()
export class YouTubeService {
  private readonly log = new Logger(YouTubeService.name);
  private readonly key: string | undefined;

  constructor(config: ConfigService) {
    this.key = config.get<string>('YOUTUBE_API_KEY') || undefined;
  }

  get enabled(): boolean {
    return !!this.key;
  }

  /** Embeddable, safe-search videos for the query; [] when disabled or on any provider failure. */
  async search(
    query: string,
    language: string,
    max = 3,
  ): Promise<YouTubeVideo[]> {
    if (!this.key || !query.trim()) return [];
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({
      key: this.key,
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      maxResults: String(max),
      q: query.slice(0, 200),
      relevanceLanguage: language.slice(0, 2),
    }).toString();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) {
        this.log.warn(`youtube search failed: HTTP ${res.status}`);
        return [];
      }
      return parseSearch(await res.json());
    } catch (e) {
      this.log.warn(`youtube search failed: ${String(e)}`);
      return [];
    }
  }
}

type SearchItem = {
  id?: { videoId?: unknown };
  snippet?: {
    title?: unknown;
    channelTitle?: unknown;
    thumbnails?: { medium?: { url?: unknown } };
  };
};

// search.list returns HTML-escaped snippet text; the app renders plain text.
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};
const unescape = (s: string) =>
  s.replace(/&(amp|quot|#39|lt|gt);/g, (m) => ENTITIES[m]);
const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? unescape(v).slice(0, max) : null;
const httpsUrl = (v: unknown) => {
  const s = str(v, 500);
  return s?.startsWith('https://i.ytimg.com/') ? s : null;
};

/** Provider output is untrusted: keep only items with a well-formed id and a title. */
export function parseSearch(body: unknown): YouTubeVideo[] {
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: YouTubeVideo[] = [];
  for (const it of items as SearchItem[]) {
    const id = it?.id?.videoId;
    const title = str(it?.snippet?.title, 300);
    if (
      typeof id !== 'string' ||
      !VIDEO_ID.test(id) ||
      !title ||
      out.some((v) => v.id === id || (v.title === title && v.channel === str(it.snippet?.channelTitle, 200)))
    )
      continue;
    out.push({
      id,
      title,
      channel: str(it.snippet?.channelTitle, 200),
      thumbnailUrl: httpsUrl(it.snippet?.thumbnails?.medium?.url),
    });
  }
  return out;
}
