import { NextRequest, NextResponse } from 'next/server';
import { fetchAllArticles } from '@/lib/sources';
import { generateEmbeddings, OpenAIQuotaExceededError, OpenAIRateLimitError } from '@/lib/openai';
import { getExistingUrls, saveArticles } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('Starting article fetch...');

    // Fetch articles from all sources
    const rawArticles = await fetchAllArticles();
    console.log(`Fetched ${rawArticles.length} articles from sources`);

    if (rawArticles.length === 0) {
      return NextResponse.json({ message: 'No articles fetched', count: 0 });
    }

    // Filter out existing articles
    const urls = rawArticles.map((a) => a.url);
    const existingUrls = await getExistingUrls(urls);
    const newArticles = rawArticles.filter((a) => !existingUrls.has(a.url));

    console.log(`${newArticles.length} new articles after filtering`);

    if (newArticles.length === 0) {
      return NextResponse.json({ message: 'No new articles', count: 0 });
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
      return NextResponse.json(
        { error: 'OpenAI quota exceeded. Please check your billing details.' },
        { status: 503 }
      );
    }

    if (rateLimited) {
      return NextResponse.json(
        { error: 'OpenAI rate limit reached. Please try again later.' },
        { status: 429 }
      );
    }

    // Save to database
    if (articlesToSave.length > 0) {
      await saveArticles(articlesToSave);
      console.log(`Saved ${articlesToSave.length} articles to database`);
    }

    return NextResponse.json({
      message: 'Articles fetched successfully',
      fetched: rawArticles.length,
      new: newArticles.length,
      saved: articlesToSave.length,
    });
  } catch (error) {
    console.error('Error in fetch cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
