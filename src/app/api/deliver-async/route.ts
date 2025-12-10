import { NextRequest, NextResponse } from 'next/server';
import { sendDM, formatArticlesMessage } from '@/lib/discord';
import {
  getUser,
  getUserThemes,
  getTodayArticles,
  getDeliveredArticleIds,
  markAsDelivered,
} from '@/lib/supabase';
import { cosineSimilarity } from '@/lib/openai';
import type { Article, Theme, ScoredArticle } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const { userId, channelId } = await request.json();

    console.log(`[Deliver-Async] Starting delivery for user ${userId}`);

    const user = await getUser(userId);
    if (!user) {
      await sendChannelMessage(channelId, `<@${userId}> ❌ ユーザー情報が見つかりませんでした。`);
      return NextResponse.json({ success: false });
    }

    const themes = await getUserThemes(user.id);
    if (themes.length === 0) {
      await sendChannelMessage(channelId, `<@${userId}> ❌ テーマが登録されていません。`);
      return NextResponse.json({ success: false });
    }

    // Get today's articles
    const articles = await getTodayArticles();
    console.log(`[Deliver-Async] Found ${articles.length} articles for today`);

    if (articles.length === 0) {
      await sendChannelMessage(
        channelId,
        `<@${userId}> ❌ 配信可能な記事がありません。\n記事は毎朝9時に自動取得されます。`
      );
      return NextResponse.json({ success: false });
    }

    // Get already delivered article IDs
    const deliveredIds = await getDeliveredArticleIds(user.id);
    console.log(`[Deliver-Async] User has ${deliveredIds.size} delivered articles`);

    // Filter out delivered articles
    const undeliveredArticles = articles.filter((a) => !deliveredIds.has(a.id));
    console.log(`[Deliver-Async] ${undeliveredArticles.length} undelivered articles`);

    if (undeliveredArticles.length === 0) {
      await sendChannelMessage(
        channelId,
        `<@${userId}> ✅ 未配信の記事がありません。すべて配信済みです。`
      );
      return NextResponse.json({ success: false });
    }

    // Score and match articles
    const scoredArticles = matchArticles(themes, undeliveredArticles, user.article_count);
    console.log(`[Deliver-Async] Matched ${scoredArticles.length} articles (threshold: 0.3)`);

    if (scoredArticles.length === 0) {
      await sendChannelMessage(
        channelId,
        `<@${userId}> 🔍 マッチする記事が見つかりませんでした。`
      );
      return NextResponse.json({ success: false });
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

    console.log(`[Deliver-Async] Sending DM with ${scoredArticles.length} articles`);
    const sent = await sendDM(user.discord_id, message);

    if (sent) {
      // Mark as delivered
      await markAsDelivered(
        user.id,
        scoredArticles.map((a) => a.id)
      );
      console.log(
        `[Deliver-Async] ✅ Successfully delivered ${scoredArticles.length} articles to user ${user.discord_id}`
      );
      await sendChannelMessage(
        channelId,
        `<@${userId}> ✅ ${scoredArticles.length}件の記事をDMで送信しました！`
      );
      return NextResponse.json({ success: true });
    } else {
      console.error(`[Deliver-Async] ❌ Failed to send DM to user ${user.discord_id}`);
      await sendChannelMessage(
        channelId,
        `<@${userId}> ❌ DMの送信に失敗しました。DMを受信できる設定になっているか確認してください。`
      );
      return NextResponse.json({ success: false });
    }
  } catch (error) {
    console.error('[Deliver-Async] Error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

async function sendChannelMessage(channelId: string, content: string) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to send channel message: ${response.status}`, errorText);
  }
}

function matchArticles(themes: Theme[], articles: Article[], limit: number): ScoredArticle[] {
  const scored: ScoredArticle[] = [];

  for (const article of articles) {
    let maxScore = 0;
    let matchedTheme = '';

    for (const theme of themes) {
      const themeEmbedding =
        typeof theme.embedding === 'string' ? JSON.parse(theme.embedding) : theme.embedding;

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
