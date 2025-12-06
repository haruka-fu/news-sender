import { NextRequest, NextResponse } from 'next/server';
import { fetchAndSaveArticles } from '@/lib/articles';

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await fetchAndSaveArticles();

  if (!result.success) {
    const status = result.error?.includes('quota') ? 503 : result.error?.includes('rate limit') ? 429 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  if (result.saved === 0) {
    return NextResponse.json({ message: 'No new articles', count: 0 });
  }

  return NextResponse.json({
    message: 'Articles fetched successfully',
    fetched: result.fetched,
    new: result.new,
    saved: result.saved,
  });
}
