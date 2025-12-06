import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;

export class OpenAIQuotaExceededError extends Error {
  constructor() {
    super('OpenAI API quota exceeded. Please check your plan and billing details.');
    this.name = 'OpenAIQuotaExceededError';
  }
}

export class OpenAIRateLimitError extends Error {
  constructor() {
    super('OpenAI API rate limit reached. Please try again later.');
    this.name = 'OpenAIRateLimitError';
  }
}

export class OpenAITimeoutError extends Error {
  constructor() {
    super('OpenAI API request timed out. Please check your network connection.');
    this.name = 'OpenAITimeoutError';
  }
}

export class OpenAIConnectionError extends Error {
  constructor() {
    super('Failed to connect to OpenAI API. Please check your network or firewall settings.');
    this.name = 'OpenAIConnectionError';
  }
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 seconds timeout
      maxRetries: 2, // Retry twice on transient errors
    });
  }
  return openaiClient;
}

function handleOpenAIError(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    console.error('[OpenAI] API Error:', {
      status: error.status,
      code: error.code,
      message: error.message,
    });

    if (error.status === 429) {
      if (error.code === 'insufficient_quota') {
        throw new OpenAIQuotaExceededError();
      }
      throw new OpenAIRateLimitError();
    }
  }

  if (error instanceof Error) {
    // Handle timeout errors
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      console.error('[OpenAI] Request timeout');
      throw new OpenAITimeoutError();
    }

    // Handle connection errors
    if (error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND') ||
        error.message.includes('network') ||
        error.message.includes('fetch failed')) {
      console.error('[OpenAI] Connection error:', error.message);
      throw new OpenAIConnectionError();
    }
  }

  console.error('[OpenAI] Unexpected error:', error);
  throw error;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient();
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return response.data[0].embedding;
  } catch (error) {
    handleOpenAIError(error);
  }
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const openai = getOpenAIClient();
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  } catch (error) {
    handleOpenAIError(error);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}
