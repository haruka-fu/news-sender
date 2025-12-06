import Parser from 'rss-parser';
import type { RawArticle } from '@/types';

const parser = new Parser();

const ZENN_RSS_URL = 'https://zenn.dev/feed';

export async function fetchZennArticles(): Promise<RawArticle[]> {
  try {
    const feed = await parser.parseURL(ZENN_RSS_URL);

    return feed.items.map((item) => ({
      url: item.link || '',
      title: item.title || '',
      description: item.contentSnippet?.slice(0, 500) || null,
      source: 'zenn' as const,
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
    })).filter((article) => article.url && article.title);
  } catch (error) {
    console.error('Error fetching Zenn articles:', error);
    return [];
  }
}
