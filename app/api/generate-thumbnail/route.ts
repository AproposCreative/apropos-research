import { NextRequest, NextResponse } from 'next/server';
import { POST as generateImage } from '@/app/api/generate-image/route';
import { createSuccessResponse } from '@/lib/api/types';
import { getRequestId } from '@/lib/api/request-utils';

/** Legacy response adapter, not a second image-generation implementation.
 * Uses shared selection, paid-generation switch and budget boundary.
 * Request identity, cancellation and headers remain intact. No HTTP self-call.
 */
export async function POST(request: NextRequest) {
  const response = await generateImage(request);
  if (!response.ok) return response;
  const data = await response.json();
  if (data.success !== true || typeof data.imageUrl !== 'string' || !data.imageUrl) {
    return NextResponse.json({ error: 'Billedet kunne ikke klargøres.' }, { status: 502 });
  }
  return NextResponse.json(createSuccessResponse(data, { requestId: getRequestId(request) }), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
