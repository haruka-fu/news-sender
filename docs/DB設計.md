# DB設計

## 概要

Supabase（PostgreSQL）を使用。
Embeddingの保存には`vector`型（pgvector拡張）を使用。

## ER図

```txt
┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│   users     │       │   themes    │       │    articles     │
├─────────────┤       ├─────────────┤       ├─────────────────┤
│ id (PK)     │───┐   │ id (PK)     │       │ id (PK)         │
│ discord_id  │   └──►│ user_id(FK) │       │ url (UNIQUE)    │
│ article_cnt │       │ name        │       │ title           │
│ is_active   │       │ embedding   │       │ description     │
│ created_at  │       │ created_at  │       │ source          │
│ updated_at  │       └─────────────┘       │ embedding       │
└─────────────┘                             │ published_at    │
                                            │ created_at      │
                                            └─────────────────┘
```

## テーブル定義

### users

ユーザー情報を管理。

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL UNIQUE,
  article_count INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_users_discord_id ON users(discord_id);
CREATE INDEX idx_users_is_active ON users(is_active);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| discord_id | TEXT | Discord ユーザーID |
| article_count | INTEGER | 1日あたりの配信件数（デフォルト10） |
| is_active | BOOLEAN | 配信有効/無効 |
| created_at | TIMESTAMP | 登録日時 |
| updated_at | TIMESTAMP | 更新日時 |

### themes

ユーザーが登録した興味テーマ。

```sql
-- pgvector拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, name)
);

-- インデックス
CREATE INDEX idx_themes_user_id ON themes(user_id);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| user_id | UUID | ユーザーID（外部キー） |
| name | TEXT | テーマ名（例: React, AWS） |
| embedding | vector(1536) | テーマのEmbedding |
| created_at | TIMESTAMP | 登録日時 |

### articles

取得した記事情報。

```sql
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_articles_url ON articles(url);
CREATE INDEX idx_articles_source ON articles(source);
CREATE INDEX idx_articles_published_at ON articles(published_at);
CREATE INDEX idx_articles_created_at ON articles(created_at);

-- ベクトル検索用インデックス（IVFFlat）
CREATE INDEX idx_articles_embedding ON articles
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| url | TEXT | 記事URL（ユニーク） |
| title | TEXT | 記事タイトル |
| description | TEXT | 記事概要 |
| source | TEXT | 取得元（qiita, zenn, hatena） |
| embedding | vector(1536) | 記事のEmbedding |
| published_at | TIMESTAMP | 記事公開日時 |
| created_at | TIMESTAMP | DB登録日時 |

### delivered_articles（配信履歴）

同じ記事を再配信しないための履歴。

```sql
CREATE TABLE delivered_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, article_id)
);

-- インデックス
CREATE INDEX idx_delivered_user_id ON delivered_articles(user_id);
CREATE INDEX idx_delivered_article_id ON delivered_articles(article_id);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| id | UUID | 主キー |
| user_id | UUID | ユーザーID |
| article_id | UUID | 記事ID |
| delivered_at | TIMESTAMP | 配信日時 |

## Supabaseでの設定

### pgvector拡張の有効化

Supabaseダッシュボード → Database → Extensions → `vector` を有効化

または SQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### RLS（Row Level Security）

今回はサーバーサイドからのみアクセスするため、Service Keyを使用。
RLSは無効のままで可。

```sql
-- RLSを無効化（サーバーサイドのみアクセス）
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE themes DISABLE ROW LEVEL SECURITY;
ALTER TABLE articles DISABLE ROW LEVEL SECURITY;
ALTER TABLE delivered_articles DISABLE ROW LEVEL SECURITY;
```

## クエリ例

### ユーザーのテーマ取得

```sql
SELECT id, name, embedding
FROM themes
WHERE user_id = $1;
```

### 今日の記事取得

```sql
SELECT id, url, title, description, source, embedding
FROM articles
WHERE created_at >= CURRENT_DATE
ORDER BY published_at DESC;
```

### 類似記事検索（pgvector）

```sql
-- テーマEmbeddingに近い記事を取得
SELECT
  id, url, title, source,
  1 - (embedding <=> $1) AS similarity
FROM articles
WHERE created_at >= CURRENT_DATE
  AND id NOT IN (
    SELECT article_id FROM delivered_articles WHERE user_id = $2
  )
ORDER BY embedding <=> $1
LIMIT $3;
```

### 配信履歴登録

```sql
INSERT INTO delivered_articles (user_id, article_id)
VALUES ($1, $2)
ON CONFLICT (user_id, article_id) DO NOTHING;
```

## データ保持期間

古い記事データを定期的に削除:

```sql
-- 30日以上前の記事を削除
DELETE FROM articles
WHERE created_at < NOW() - INTERVAL '30 days';
```

Supabaseのpg_cronで定期実行設定:

```sql
SELECT cron.schedule(
  'cleanup-old-articles',
  '0 0 * * *',  -- 毎日0時
  $$DELETE FROM articles WHERE created_at < NOW() - INTERVAL '30 days'$$
);
```
