import { fetchQiitaArticles } from './qiita';
import { fetchZennArticles } from './zenn';
import { fetchHatenaArticles } from './hatena';
import type { RawArticle } from '@/types';

export async function fetchAllArticles(): Promise<RawArticle[]> {
  const results = await Promise.allSettled([
    fetchQiitaArticles(),
    fetchZennArticles(),
    fetchHatenaArticles(),
  ]);

  const articles: RawArticle[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      console.error('Failed to fetch articles:', result.reason);
    }
  }

  return articles;
}

export { fetchQiitaArticles, fetchZennArticles, fetchHatenaArticles };
