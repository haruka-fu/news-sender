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

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

function handleOpenAIError(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      if (error.code === 'insufficient_quota') {
        throw new OpenAIQuotaExceededError();
      }
      throw new OpenAIRateLimitError();
    }
  }
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
