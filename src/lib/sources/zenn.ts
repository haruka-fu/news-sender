import { extract } from '@extractus/feed-extractor';
import type { RawArticle } from '@/types';

const ZENN_RSS_URL = 'https://zenn.dev/feed';

export async function fetchZennArticles(): Promise<RawArticle[]> {
  try {
    const feed = await extract(ZENN_RSS_URL);

    return (feed.entries || []).map((item) => ({
      url: item.link || '',
      title: item.title || '',
      description: item.description?.slice(0, 500) || null,
      source: 'zenn' as const,
      published_at: item.published ? new Date(item.published).toISOString() : null,
    })).filter((article) => article.url && article.title);
  } catch (error) {
    console.error('Error fetching Zenn articles:', error);
    return [];
  }
}
