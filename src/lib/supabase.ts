import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { User, Theme, Article, DeliveredArticle } from '@/types';

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEYS;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEYS');
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

// User operations
export async function getUser(discordId: string): Promise<User | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('discord_id', discordId)
    .single();

  if (error) return null;
  return data;
}

export async function createUser(discordId: string): Promise<User> {
  const { data, error } = await getSupabase()
    .from('users')
    .insert({ discord_id: discordId })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateUser(
  userId: string,
  updates: Partial<Pick<User, 'article_count' | 'is_active'>>
): Promise<User> {
  const { data, error } = await getSupabase()
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getActiveUsers(): Promise<User[]> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('is_active', true);

  if (error) throw error;
  return data || [];
}

// Theme operations
export async function getUserThemes(userId: string): Promise<Theme[]> {
  const { data, error } = await getSupabase()
    .from('themes')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return data || [];
}

export async function addTheme(
  userId: string,
  name: string,
  embedding: number[]
): Promise<Theme> {
  const { data, error } = await getSupabase()
    .from('themes')
    .insert({
      user_id: userId,
      name,
      embedding: JSON.stringify(embedding),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function removeTheme(userId: string, name: string): Promise<void> {
  const { error } = await getSupabase()
    .from('themes')
    .delete()
    .eq('user_id', userId)
    .eq('name', name);

  if (error) throw error;
}

// Article operations
export async function getExistingUrls(urls: string[]): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from('articles')
    .select('url')
    .in('url', urls);

  if (error) throw error;
  return new Set((data || []).map((a) => a.url));
}

export async function saveArticles(
  articles: Array<{
    url: string;
    title: string;
    description: string | null;
    source: string;
    embedding: number[];
    published_at: string | null;
  }>
): Promise<number> {
  if (articles.length === 0) return 0;

  // Insert articles one by one to handle duplicates gracefully
  let savedCount = 0;
  for (const article of articles) {
    const { error } = await getSupabase().from('articles').insert({
      ...article,
      embedding: JSON.stringify(article.embedding),
    });

    if (error) {
      // Skip duplicate entries (error code 23505)
      if (error.code === '23505') {
        console.log(`Skipping duplicate article: ${article.url}`);
        continue;
      }
      // For other errors, log but continue
      console.error(`Error saving article ${article.url}:`, error);
      continue;
    }

    savedCount++;
  }

  console.log(`Successfully saved ${savedCount}/${articles.length} articles`);
  return savedCount;
}

export async function getTodayArticles(): Promise<Article[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data, error } = await getSupabase()
    .from('articles')
    .select('*')
    .gte('created_at', today.toISOString())
    .order('published_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((a) => ({
    ...a,
    embedding: typeof a.embedding === 'string' ? JSON.parse(a.embedding) : a.embedding,
  }));
}

export async function getDeliveredArticleIds(userId: string): Promise<Set<string>> {
  const { data, error } = await getSupabase()
    .from('delivered_articles')
    .select('article_id')
    .eq('user_id', userId);

  if (error) throw error;
  return new Set((data || []).map((d) => d.article_id));
}

export async function markAsDelivered(
  userId: string,
  articleIds: string[]
): Promise<void> {
  if (articleIds.length === 0) return;

  const { error } = await getSupabase().from('delivered_articles').insert(
    articleIds.map((articleId) => ({
      user_id: userId,
      article_id: articleId,
    }))
  );

  if (error && !error.message.includes('duplicate')) throw error;
}
