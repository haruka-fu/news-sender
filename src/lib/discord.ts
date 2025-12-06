import { verifyKey } from 'discord-interactions';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const DISCORD_API_TIMEOUT = 10000; // 10 seconds

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = DISCORD_API_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function verifyDiscordRequest(
  body: string,
  signature: string | null,
  timestamp: string | null
): Promise<boolean> {
  if (!signature || !timestamp) return false;

  return verifyKey(body, signature, timestamp, DISCORD_PUBLIC_KEY);
}

export async function sendDM(userId: string, content: string): Promise<boolean> {
  try {
    console.log(`[Discord] Attempting to send DM to user: ${userId}`);

    // Create DM channel
    const dmChannelRes = await fetchWithTimeout('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: userId }),
    });

    if (!dmChannelRes.ok) {
      const errorText = await dmChannelRes.text();
      console.error(`[Discord] Failed to create DM channel (Status: ${dmChannelRes.status}):`, errorText);
      return false;
    }

    const dmChannel = await dmChannelRes.json();
    console.log(`[Discord] DM channel created: ${dmChannel.id}`);

    // Send message
    const messageRes = await fetchWithTimeout(
      `https://discord.com/api/v10/channels/${dmChannel.id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      }
    );

    if (!messageRes.ok) {
      const errorText = await messageRes.text();
      console.error(`[Discord] Failed to send DM (Status: ${messageRes.status}):`, errorText);
      return false;
    }

    console.log(`[Discord] DM sent successfully to user: ${userId}`);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[Discord] Request timeout - firewall or network issue');
      return false;
    }
    console.error('[Discord] Error sending DM:', error);
    return false;
  }
}

export function formatArticlesMessage(
  articles: Array<{
    title: string;
    url: string;
    source: string;
    matched_theme: string;
  }>
): string {
  if (articles.length === 0) {
    return '今日のおすすめ記事はありません。';
  }

  // Group by theme
  const grouped = articles.reduce(
    (acc, article) => {
      if (!acc[article.matched_theme]) {
        acc[article.matched_theme] = [];
      }
      acc[article.matched_theme].push(article);
      return acc;
    },
    {} as Record<string, typeof articles>
  );

  const lines: string[] = [`📰 **今日のおすすめ記事（${articles.length}件）**\n`];

  for (const [theme, themeArticles] of Object.entries(grouped)) {
    lines.push(`🏷️ **${theme}**`);
    for (const article of themeArticles) {
      const sourceLabel = {
        qiita: 'Qiita',
        zenn: 'Zenn',
        hatena: 'はてブ',
      }[article.source] || article.source;

      lines.push(`• ${article.title} - ${sourceLabel}`);
      lines.push(`  ${article.url}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
