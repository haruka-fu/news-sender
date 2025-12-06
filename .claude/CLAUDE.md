# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Discordボット：Qiita/Zenn/はてブから記事を取得し、OpenAI埋め込みとコサイン類似度でユーザーのテーマにマッチした記事を配信。

## セキュリティ

- npm install のセキュリティに注意（ウイルスが話題）
- React Next.jsのセキュリティに注意（重大な問題が話題）

## コマンド

```bash
npm run dev                # 開発サーバー起動
npm run build              # ビルド
npm run register-commands  # Discordコマンド登録
```

## アーキテクチャ

### システムフロー

1. **記事取得 + 配信（Cron）**: 毎朝9時（UTC 0:00）
   - RSS取得 → OpenAI埋め込み生成 → Supabase保存 → ユーザーに配信

2. **Discordコマンド**: リアルタイム
   - `/theme add` でテーマ登録時に埋め込み生成（OpenAI API呼び出し）
   - `/deliver` で手動配信

### ディレクトリ構成

```txt
src/
├── app/api/
│   ├── interactions/route.ts    # Discordコマンドハンドラー
│   └── cron/
│       ├── fetch/route.ts       # 記事取得（手動実行用）
│       └── deliver/route.ts     # 記事取得→配信（cronで実行）
├── lib/
│   ├── articles.ts              # 記事取得のコアロジック
│   ├── discord.ts               # Discord API連携
│   ├── openai.ts                # 埋め込み生成・類似度計算
│   ├── supabase.ts              # DB操作
│   └── sources/                 # RSS取得（qiita/zenn/hatena）
└── types/index.ts
```

### データベース（Supabase/PostgreSQL + pgvector）

- `users` - Discordユーザー・配信設定
- `themes` - ユーザーテーマ + 埋め込み（vector(1536)）
- `articles` - 記事 + 埋め込み（vector(1536)）
- `delivered_articles` - 配信履歴（重複防止）

### 埋め込み戦略

**モデル**: `text-embedding-3-small` (1536次元)

**API呼び出しタイミング**:

- テーマ追加時: リアルタイムで生成
- 記事取得時: 50件バッチで生成
- 配信時: API呼び出しなし（保存済み埋め込みを使用）

**マッチングアルゴリズム**:

```typescript
// 各記事と全テーマのコサイン類似度を計算し、最大値でスコアリング
score = max(cosineSimilarity(article.embedding, theme.embedding))
// スコア降順でソート、閾値0.3以上の上位N件を返却
```

### 環境変数（`.env.local`）

```txt
DISCORD_APPLICATION_ID
DISCORD_PUBLIC_KEY
DISCORD_BOT_TOKEN
OPENAI_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_KEY
CRON_SECRET
```

### Cron設定（vercel.json）

```json
{
  "crons": [
    {
      "path": "/api/cron/deliver",
      "schedule": "0 0 * * *"  // 毎日9時（JST）
    }
  ]
}
```

**重要**: `/api/cron/deliver`内で記事取得も実行するため、cronは1つだけ。

## 開発パターン

### 新規記事ソース追加

1. `src/lib/sources/newsource.ts` 作成（既存パターン参照）
2. `src/lib/sources/index.ts` に追加
3. `src/types/index.ts` の`source`型を更新

### Discordコマンド追加

1. `scripts/register-commands.ts` 編集
2. `npm run register-commands` 実行
3. `src/app/api/interactions/route.ts` にハンドラー追加

### エラーハンドリング方針

- 記事取得失敗: 該当ソースをスキップ、他は継続
- 埋め込み生成失敗: 個別記事をスキップ（レート制限対応）
- DM送信失敗: ログ記録して継続（ユーザーがDM無効の可能性）

## デプロイ

- プラットフォーム: Vercel
- Cron制限: 無料プランは1日1回まで（現在1つ使用）
- Discordコマンド登録は手動実行が必要
