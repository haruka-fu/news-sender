// Database types
export interface User {
  id: string;
  discord_id: string;
  article_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Theme {
  id: string;
  user_id: string;
  name: string;
  embedding: number[];
  created_at: string;
}

export interface Article {
  id: string;
  url: string;
  title: string;
  description: string | null;
  source: 'qiita' | 'zenn' | 'hatena';
  embedding: number[];
  published_at: string | null;
  created_at: string;
}

export interface DeliveredArticle {
  id: string;
  user_id: string;
  article_id: string;
  delivered_at: string;
}

// API types
export interface RawArticle {
  url: string;
  title: string;
  description: string | null;
  source: 'qiita' | 'zenn' | 'hatena';
  published_at: string | null;
}

export interface ScoredArticle extends Article {
  score: number;
  matched_theme: string;
}

// Discord types
export interface DiscordInteraction {
  id: string;
  type: number;
  application_id: string;
  token: string;
  data?: {
    id: string;
    name: string;
    options?: DiscordInteractionOption[];
  };
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
  user?: {
    id: string;
    username: string;
  };
}

export interface DiscordInteractionOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: DiscordInteractionOption[];
}

export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

export enum InteractionResponseType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
}
