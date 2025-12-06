import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local first, then .env as fallback
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_APPLICATION_ID || !DISCORD_BOT_TOKEN) {
  console.error('Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN');
  process.exit(1);
}

const commands = [
  {
    name: 'register',
    description: 'ユーザー登録を行います',
  },
  {
    name: 'theme',
    description: 'テーマを管理します',
    options: [
      {
        name: 'add',
        description: 'テーマを追加します',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'name',
            description: 'テーマ名（例: React, AWS, セキュリティ）',
            type: 3, // STRING
            required: true,
          },
        ],
      },
      {
        name: 'list',
        description: '登録中のテーマ一覧を表示します',
        type: 1,
      },
      {
        name: 'remove',
        description: 'テーマを削除します',
        type: 1,
        options: [
          {
            name: 'name',
            description: '削除するテーマ名',
            type: 3,
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: 'settings',
    description: '配信設定を管理します',
    options: [
      {
        name: 'count',
        description: '配信件数を設定します',
        type: 1,
        options: [
          {
            name: 'number',
            description: '件数（1〜30）',
            type: 4, // INTEGER
            required: true,
            min_value: 1,
            max_value: 30,
          },
        ],
      },
      {
        name: 'toggle',
        description: '配信のON/OFFを切り替えます',
        type: 1,
      },
      {
        name: 'status',
        description: '現在の設定を表示します',
        type: 1,
      },
    ],
  },
  {
    name: 'deliver',
    description: '記事を手動で配信します（自分のみ）',
  },
];

async function registerCommands() {
  const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Failed to register commands:', error);
    process.exit(1);
  }

  const data = await response.json();
  console.log('Commands registered successfully!');
  console.log(`Registered ${data.length} commands:`);
  data.forEach((cmd: { name: string }) => {
    console.log(`  - /${cmd.name}`);
  });
}

registerCommands();
