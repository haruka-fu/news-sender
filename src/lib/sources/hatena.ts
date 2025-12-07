import Parser from 'rss-parser';
import type { RawArticle } from '@/types';

const HATENA_RSS_URL = 'https://b.hatena.ne.jp/hotentry/it.rss';

export async function fetchHatenaArticles(): Promise<RawArticle[]> {
  try {
    const parser = new Parser();
    const feed = await parser.parseURL(HATENA_RSS_URL);

    return (feed.items || []).map((item) => ({
      url: item.link || '',
      title: item.title || '',
      description: item.contentSnippet?.slice(0, 500) || item.content?.slice(0, 500) || null,
      source: 'hatena' as const,
      published_at: item.isoDate || (item.pubDate ? new Date(item.pubDate).toISOString() : null),
    })).filter((article) => article.url && article.title);
  } catch (error) {
    console.error('Error fetching Hatena articles:', error);
    return [];
  }
}
