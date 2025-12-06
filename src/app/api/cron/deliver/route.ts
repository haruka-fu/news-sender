import { NextRequest, NextResponse } from 'next/server';
import { cosineSimilarity } from '@/lib/openai';
import { sendDM, formatArticlesMessage } from '@/lib/discord';
import { fetchAndSaveArticles } from '@/lib/articles';
import {
  getActiveUsers,
  getUserThemes,
  getTodayArticles,
  getDeliveredArticleIds,
  markAsDelivered,
} from '@/lib/supabase';
import type { Article, Theme, ScoredArticle } from '@/types';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // First, fetch new articles
    console.log('Fetching new articles before delivery...');
    const fetchResult = await fetchAndSaveArticles();
    console.log(`Fetch result: ${fetchResult.saved} new articles saved`);

    console.log('Starting article delivery...');

    // Get active users
    const users = await getActiveUsers();
    console.log(`Found ${users.length} active users`);

    if (users.length === 0) {
      return NextResponse.json({ message: 'No active users', delivered: 0 });
    }

    // Get today's articles
    const articles = await getTodayArticles();
    console.log(`Found ${articles.length} articles for today`);

    if (articles.length === 0) {
      return NextResponse.json({ message: 'No articles to deliver', delivered: 0 });
    }

    let deliveredCount = 0;

    // Deliver to each user
    for (const user of users) {
      try {
        // Get user themes
        const themes = await getUserThemes(user.id);
        if (themes.length === 0) {
          console.log(`User ${user.discord_id} has no themes, skipping`);
          continue;
        }

        // Get already delivered article IDs
        const deliveredIds = await getDeliveredArticleIds(user.id);

        // Filter out delivered articles
        const undeliveredArticles = articles.filter((a) => !deliveredIds.has(a.id));
        if (undeliveredArticles.length === 0) {
          console.log(`No undelivered articles for user ${user.discord_id}`);
          continue;
        }

        // Score and match articles
        const scoredArticles = matchArticles(themes, undeliveredArticles, user.article_count);

        if (scoredArticles.length === 0) {
          console.log(`No matching articles for user ${user.discord_id}`);
          continue;
        }

        // Format and send message
        const message = formatArticlesMessage(
          scoredArticles.map((a) => ({
            title: a.title,
            url: a.url,
            source: a.source,
            matched_theme: a.matched_theme,
          }))
        );

        const sent = await sendDM(user.discord_id, message);

        if (sent) {
          // Mark as delivered
          await markAsDelivered(
            user.id,
            scoredArticles.map((a) => a.id)
          );
          deliveredCount++;
          console.log(`Delivered ${scoredArticles.length} articles to user ${user.discord_id}`);
        } else {
          console.error(`Failed to send DM to user ${user.discord_id}`);
        }
      } catch (error) {
        console.error(`Error delivering to user ${user.discord_id}:`, error);
        // Continue with next user
      }
    }

    return NextResponse.json({
      message: 'Delivery completed',
      users: users.length,
      delivered: deliveredCount,
    });
  } catch (error) {
    console.error('Error in deliver cron:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function matchArticles(
  themes: Theme[],
  articles: Article[],
  limit: number
): ScoredArticle[] {
  const scored: ScoredArticle[] = [];

  for (const article of articles) {
    let maxScore = 0;
    let matchedTheme = '';

    for (const theme of themes) {
      const themeEmbedding =
        typeof theme.embedding === 'string'
          ? JSON.parse(theme.embedding)
          : theme.embedding;

      const score = cosineSimilarity(article.embedding, themeEmbedding);

      if (score > maxScore) {
        maxScore = score;
        matchedTheme = theme.name;
      }
    }

    // Only include articles with reasonable similarity
    if (maxScore > 0.3) {
      scored.push({
        ...article,
        score: maxScore,
        matched_theme: matchedTheme,
      });
    }
  }

  // Sort by score descending and take top N
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
