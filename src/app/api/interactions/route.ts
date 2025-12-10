import { NextRequest, NextResponse } from 'next/server';
import { verifyDiscordRequest, sendDM, formatArticlesMessage } from '@/lib/discord';
import {
  generateEmbedding,
  cosineSimilarity,
  OpenAIQuotaExceededError,
  OpenAIRateLimitError,
  OpenAITimeoutError,
  OpenAIConnectionError,
} from '@/lib/openai';
import {
  getUser,
  createUser,
  updateUser,
  getUserThemes,
  addTheme,
  removeTheme,
  getTodayArticles,
  getDeliveredArticleIds,
  markAsDelivered,
} from '@/lib/supabase';
import { fetchAndSaveArticles } from '@/lib/articles';
import {
  InteractionType,
  InteractionResponseType,
  type DiscordInteraction,
  type DiscordInteractionOption,
} from '@/types';
import type { Article, Theme, ScoredArticle } from '@/types';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');

  // Verify request
  const isValid = await verifyDiscordRequest(body, signature, timestamp);
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const interaction: DiscordInteraction = JSON.parse(body);

  // Handle PING
  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: InteractionResponseType.PONG });
  }

  // Handle commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const discordId = interaction.member?.user?.id || interaction.user?.id;
    if (!discordId) {
      return jsonResponse('ユーザー情報を取得できませんでした。');
    }

    const commandName = interaction.data?.name;
    const options = interaction.data?.options;

    try {
      switch (commandName) {
        case 'register':
          return await handleRegister(discordId);

        case 'theme':
          return await handleTheme(discordId, options);

        case 'settings':
          return await handleSettings(discordId, options);

        case 'deliver':
          return await handleDeliver(discordId, interaction);

        default:
          return jsonResponse('不明なコマンドです。');
      }
    } catch (error) {
      console.error('Command error:', error);
      return jsonResponse('エラーが発生しました。しばらく経ってから再度お試しください。');
    }
  }

  return NextResponse.json({ error: 'Unknown interaction type' }, { status: 400 });
}

function jsonResponse(content: string) {
  return NextResponse.json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: { content },
  });
}

async function handleRegister(discordId: string) {
  const existingUser = await getUser(discordId);

  if (existingUser) {
    return jsonResponse('すでに登録済みです！`/theme add` でテーマを追加してください。');
  }

  await createUser(discordId);
  return jsonResponse(
    '登録が完了しました！🎉\n\n次のステップ:\n1. `/theme add [テーマ名]` で興味のあるテーマを追加\n2. 毎朝9時におすすめ記事をお届けします'
  );
}

async function handleTheme(discordId: string, options?: DiscordInteractionOption[]) {
  const user = await getUser(discordId);
  if (!user) {
    return jsonResponse('先に `/register` でユーザー登録を行ってください。');
  }

  const subcommand = options?.[0];
  if (!subcommand) {
    return jsonResponse('サブコマンドを指定してください。');
  }

  switch (subcommand.name) {
    case 'add': {
      const themeName = subcommand.options?.find((o) => o.name === 'name')?.value as string;
      if (!themeName) {
        return jsonResponse('テーマ名を指定してください。');
      }

      // Check existing themes
      const existingThemes = await getUserThemes(user.id);
      if (existingThemes.some((t) => t.name.toLowerCase() === themeName.toLowerCase())) {
        return jsonResponse(`テーマ「${themeName}」はすでに登録されています。`);
      }

      if (existingThemes.length >= 10) {
        return jsonResponse('テーマは最大10個まで登録できます。不要なテーマを削除してください。');
      }

      // Generate embedding
      try {
        const embedding = await generateEmbedding(themeName);
        await addTheme(user.id, themeName, embedding);
        return jsonResponse(`テーマ「${themeName}」を追加しました！✅`);
      } catch (error) {
        if (error instanceof OpenAIQuotaExceededError) {
          return jsonResponse('❌ OpenAI APIの使用量制限に達しました。管理者に連絡してください。');
        }
        if (error instanceof OpenAIRateLimitError) {
          return jsonResponse('⏳ アクセスが集中しています。しばらく経ってから再度お試しください。');
        }
        if (error instanceof OpenAITimeoutError) {
          return jsonResponse('⏱️ リクエストがタイムアウトしました。ネットワーク接続を確認してください。');
        }
        if (error instanceof OpenAIConnectionError) {
          return jsonResponse('🔌 OpenAI APIへの接続に失敗しました。ネットワークまたはファイアウォール設定を確認してください。');
        }
        throw error;
      }
    }

    case 'list': {
      const themes = await getUserThemes(user.id);
      if (themes.length === 0) {
        return jsonResponse('登録されているテーマはありません。`/theme add` で追加してください。');
      }

      const themeList = themes.map((t) => `• ${t.name}`).join('\n');
      return jsonResponse(`📋 **登録中のテーマ（${themes.length}件）**\n\n${themeList}`);
    }

    case 'remove': {
      const themeName = subcommand.options?.find((o) => o.name === 'name')?.value as string;
      if (!themeName) {
        return jsonResponse('テーマ名を指定してください。');
      }

      const themes = await getUserThemes(user.id);
      const theme = themes.find((t) => t.name.toLowerCase() === themeName.toLowerCase());

      if (!theme) {
        return jsonResponse(`テーマ「${themeName}」は登録されていません。`);
      }

      await removeTheme(user.id, theme.name);
      return jsonResponse(`テーマ「${theme.name}」を削除しました。🗑️`);
    }

    default:
      return jsonResponse('不明なサブコマンドです。');
  }
}

async function handleSettings(discordId: string, options?: DiscordInteractionOption[]) {
  const user = await getUser(discordId);
  if (!user) {
    return jsonResponse('先に `/register` でユーザー登録を行ってください。');
  }

  const subcommand = options?.[0];
  if (!subcommand) {
    return jsonResponse('サブコマンドを指定してください。');
  }

  switch (subcommand.name) {
    case 'count': {
      const count = subcommand.options?.find((o) => o.name === 'number')?.value as number;
      if (!count || count < 1 || count > 30) {
        return jsonResponse('配信件数は1〜30の間で指定してください。');
      }

      await updateUser(user.id, { article_count: count });
      return jsonResponse(`配信件数を ${count} 件に設定しました。✅`);
    }

    case 'toggle': {
      const newStatus = !user.is_active;
      await updateUser(user.id, { is_active: newStatus });
      return jsonResponse(
        newStatus
          ? '配信を再開しました。✅ 毎朝9時におすすめ記事をお届けします。'
          : '配信を停止しました。⏸️ 再開するには再度 `/settings toggle` を実行してください。'
      );
    }

    case 'status': {
      const themes = await getUserThemes(user.id);
      const status = [
        '⚙️ **現在の設定**',
        '',
        `📬 配信状態: ${user.is_active ? '有効 ✅' : '停止中 ⏸️'}`,
        `📊 配信件数: ${user.article_count} 件/日`,
        `🏷️ 登録テーマ: ${themes.length} 件`,
      ].join('\n');

      return jsonResponse(status);
    }

    default:
      return jsonResponse('不明なサブコマンドです。');
  }
}

async function handleDeliver(discordId: string, interaction: DiscordInteraction) {
  const user = await getUser(discordId);
  if (!user) {
    return jsonResponse('先に `/register` でユーザー登録を行ってください。');
  }

  if (!user.is_active) {
    return jsonResponse('配信が停止中です。`/settings toggle` で有効化してください。');
  }

  // Get user themes
  const themes = await getUserThemes(user.id);
  if (themes.length === 0) {
    return jsonResponse('テーマが登録されていません。`/theme add` でテーマを追加してください。');
  }

  // Respond with deferred message (gives us 15 minutes)
  const deferredResponse = NextResponse.json({
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  });

  // Execute delivery in background and send follow-up
  deliverAndFollowUp(interaction.token, user, themes).catch((error) => {
    console.error('Background delivery error:', error);
  });

  return deferredResponse;
}

async function deliverAndFollowUp(
  interactionToken: string,
  user: { id: string; discord_id: string; article_count: number },
  themes: Theme[]
) {
  try {
    const result = await deliverToUser(user, themes);
    await sendFollowUpMessage(interactionToken, result);
  } catch (error) {
    console.error('Delivery error:', error);
    await sendFollowUpMessage(interactionToken, '❌ 配信中にエラーが発生しました。');
  }
}

async function sendFollowUpMessage(interactionToken: string, content: string) {
  const url = `https://discord.com/api/v10/webhooks/${process.env.DISCORD_APPLICATION_ID}/${interactionToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    console.error(`Failed to send follow-up message: ${response.status}`);
  }
}

async function deliverToUser(
  user: { id: string; discord_id: string; article_count: number },
  themes: Theme[]
): Promise<string> {
  try {
    console.log(`[Deliver] Starting background delivery for user ${user.discord_id}`);

    // Get today's articles (fetched by cron job)
    const articles = await getTodayArticles();
    console.log(`[Deliver] Found ${articles.length} articles for today`);

    if (articles.length === 0) {
      console.log('[Deliver] No articles available');
      return '❌ 配信可能な記事がありません。\n記事は毎朝9時に自動取得されます。';
    }

    // Get already delivered article IDs
    const deliveredIds = await getDeliveredArticleIds(user.id);
    console.log(`[Deliver] User has ${deliveredIds.size} delivered articles`);

    // Filter out delivered articles
    const undeliveredArticles = articles.filter((a) => !deliveredIds.has(a.id));
    console.log(`[Deliver] ${undeliveredArticles.length} undelivered articles`);

    if (undeliveredArticles.length === 0) {
      console.log('[Deliver] All articles already delivered');
      return '✅ 未配信の記事がありません。すべて配信済みです。';
    }

    // Score and match articles
    const scoredArticles = matchArticles(themes, undeliveredArticles, user.article_count);
    console.log(`[Deliver] Matched ${scoredArticles.length} articles (threshold: 0.3)`);

    if (scoredArticles.length === 0) {
      console.log('[Deliver] No matching articles found');
      return '🔍 マッチする記事が見つかりませんでした。';
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

    console.log(`[Deliver] Sending DM with ${scoredArticles.length} articles`);
    const sent = await sendDM(user.discord_id, message);

    if (sent) {
      // Mark as delivered
      await markAsDelivered(
        user.id,
        scoredArticles.map((a) => a.id)
      );
      console.log(`[Deliver] ✅ Successfully delivered ${scoredArticles.length} articles to user ${user.discord_id}`);
      return `✅ ${scoredArticles.length}件の記事をDMで送信しました！`;
    } else {
      console.error(`[Deliver] ❌ Failed to send DM to user ${user.discord_id}`);
      return '❌ DMの送信に失敗しました。DMを受信できる設定になっているか確認してください。';
    }
  } catch (error) {
    console.error('[Deliver] Error in deliverToUser:', error);
    throw error;
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
