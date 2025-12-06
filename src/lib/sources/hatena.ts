import { extract } from '@extractus/feed-extractor';
import type { RawArticle } from '@/types';

const HATENA_RSS_URL = 'https://b.hatena.ne.jp/hotentry/it.rss';

export async function fetchHatenaArticles(): Promise<RawArticle[]> {
  try {
    const feed = await extract(HATENA_RSS_URL);

    return (feed.entries || []).map((item) => ({
      url: item.link || '',
      title: item.title || '',
      description: item.description?.slice(0, 500) || null,
      source: 'hatena' as const,
      published_at: item.published ? new Date(item.published).toISOString() : null,
    })).filter((article) => article.url && article.title);
  } catch (error) {
    console.error('Error fetching Hatena articles:', error);
    return [];
  }
}
