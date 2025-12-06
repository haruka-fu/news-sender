import { NextRequest, NextResponse } from 'next/server';
import { verifyDiscordRequest } from '@/lib/discord';
import { generateEmbedding } from '@/lib/openai';
import {
  getUser,
  createUser,
  updateUser,
  getUserThemes,
  addTheme,
  removeTheme,
} from '@/lib/supabase';
import {
  InteractionType,
  InteractionResponseType,
  type DiscordInteraction,
  type DiscordInteractionOption,
} from '@/types';

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
      const embedding = await generateEmbedding(themeName);
      await addTheme(user.id, themeName, embedding);

      return jsonResponse(`テーマ「${themeName}」を追加しました！✅`);
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
