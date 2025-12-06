import { extract } from '@extractus/feed-extractor';
import type { RawArticle } from '@/types';

const QIITA_RSS_URL = 'https://qiita.com/popular-items/feed';

export async function fetchQiitaArticles(): Promise<RawArticle[]> {
  try {
    const feed = await extract(QIITA_RSS_URL);

    return (feed.entries || []).map((item) => ({
      url: item.link || '',
      title: item.title || '',
      description: item.description?.slice(0, 500) || null,
      source: 'qiita' as const,
      published_at: item.published ? new Date(item.published).toISOString() : null,
    })).filter((article) => article.url && article.title);
  } catch (error) {
    console.error('Error fetching Qiita articles:', error);
    return [];
  }
}
