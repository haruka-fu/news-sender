-- =============================================
-- news-sender データベースセットアップ
-- Supabase SQL Editor で実行してください
-- =============================================

-- 1. pgvector拡張を有効化
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. usersテーブル
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id TEXT NOT NULL UNIQUE,
  article_count INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- 3. themesテーブル
CREATE TABLE IF NOT EXISTS themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_themes_user_id ON themes(user_id);

-- 4. articlesテーブル
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at);

-- 5. delivered_articlesテーブル（配信履歴）
CREATE TABLE IF NOT EXISTS delivered_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  delivered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_delivered_user_id ON delivered_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_delivered_article_id ON delivered_articles(article_id);

-- 6. 古い記事を自動削除するための関数（オプション）
CREATE OR REPLACE FUNCTION cleanup_old_articles()
RETURNS void AS $$
BEGIN
  DELETE FROM articles
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 確認用クエリ
SELECT 'Setup completed!' AS status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
