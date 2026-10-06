import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { dispatchMcpWelcomes } from '@/lib/mcp/welcome';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const denied = requireCronBearer(request); if (denied) return denied;
  return NextResponse.json(await dispatchMcpWelcomes());
}
