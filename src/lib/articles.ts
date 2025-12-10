import { fetchAllArticles } from '@/lib/sources';
import { generateEmbeddings, OpenAIQuotaExceededError, OpenAIRateLimitError } from '@/lib/openai';
import { getExistingUrls, saveArticles } from '@/lib/supabase';

export interface FetchResult {
  success: boolean;
  fetched: number;
  new: number;
  saved: number;
  error?: string;
}

/**
 * Fetch new articles from all sources and save to database
 */
export async function fetchAndSaveArticles(): Promise<FetchResult> {
  try {
    console.log('Starting article fetch...');

    // Fetch articles from all sources
    const rawArticles = await fetchAllArticles();
    console.log(`Fetched ${rawArticles.length} articles from sources`);

    if (rawArticles.length === 0) {
      return { success: true, fetched: 0, new: 0, saved: 0 };
    }

    // Filter out existing articles
    const urls = rawArticles.map((a) => a.url);
    const existingUrls = await getExistingUrls(urls);
    const newArticles = rawArticles.filter((a) => !existingUrls.has(a.url));

    console.log(`${newArticles.length} new articles after filtering`);

    if (newArticles.length === 0) {
      return { success: true, fetched: rawArticles.length, new: 0, saved: 0 };
    }

    // Generate embeddings in batches
    const BATCH_SIZE = 50;
    const articlesToSave: Array<{
      url: string;
      title: string;
      description: string | null;
      source: string;
      embedding: number[];
      published_at: string | null;
    }> = [];

    let quotaExceeded = false;
    let rateLimited = false;

    for (let i = 0; i < newArticles.length; i += BATCH_SIZE) {
      const batch = newArticles.slice(i, i + BATCH_SIZE);
      const texts = batch.map((a) => `${a.title} ${a.description || ''}`);

      try {
        const embeddings = await generateEmbeddings(texts);

        for (let j = 0; j < batch.length; j++) {
          articlesToSave.push({
            url: batch[j].url,
            title: batch[j].title,
            description: batch[j].description,
            source: batch[j].source,
            embedding: embeddings[j],
            published_at: batch[j].published_at,
          });
        }
      } catch (error) {
        if (error instanceof OpenAIQuotaExceededError) {
          console.error('OpenAI quota exceeded, stopping embedding generation');
          quotaExceeded = true;
          break;
        }
        if (error instanceof OpenAIRateLimitError) {
          console.error('OpenAI rate limit hit, stopping embedding generation');
          rateLimited = true;
          break;
        }
        console.error(`Error generating embeddings for batch ${i}:`, error);
      }
    }

    if (quotaExceeded) {
      return {
        success: false,
        fetched: rawArticles.length,
        new: newArticles.length,
        saved: 0,
        error: 'OpenAI quota exceeded. Please check your billing details.',
      };
    }

    if (rateLimited) {
      return {
        success: false,
        fetched: rawArticles.length,
        new: newArticles.length,
        saved: 0,
        error: 'OpenAI rate limit reached. Please try again later.',
      };
    }

    // Save to database
    let actualSaved = 0;
    if (articlesToSave.length > 0) {
      actualSaved = await saveArticles(articlesToSave);
    }

    return {
      success: true,
      fetched: rawArticles.length,
      new: newArticles.length,
      saved: actualSaved,
    };
  } catch (error) {
    console.error('Error in fetchAndSaveArticles:', error);
    return {
      success: false,
      fetched: 0,
      new: 0,
      saved: 0,
      error: 'Internal server error',
    };
  }
}
