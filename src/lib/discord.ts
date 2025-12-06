import { verifyKey } from 'discord-interactions';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;

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
    // Create DM channel
    const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient_id: userId }),
    });

    if (!dmChannelRes.ok) {
      console.error('Failed to create DM channel:', await dmChannelRes.text());
      return false;
    }

    const dmChannel = await dmChannelRes.json();

    // Send message
    const messageRes = await fetch(
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
      console.error('Failed to send DM:', await messageRes.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending DM:', error);
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
