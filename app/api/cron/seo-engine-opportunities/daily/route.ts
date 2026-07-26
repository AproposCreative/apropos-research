import { NextRequest } from 'next/server';
import { handleOpportunityCron } from '@/lib/seo-engine/opportunity-engine/cron';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleOpportunityCron(req, 'daily');
}
