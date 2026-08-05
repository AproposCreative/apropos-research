import { NextRequest, NextResponse } from 'next/server';
import { getRequestId } from '@/lib/api/request-utils';
import { createSuccessResponse } from '@/lib/api/types';
import { livProfileForUi, LIV_PROMPT_VERSION } from '@/lib/accreditation/liv-system-prompt';
import { LIV_ADDRESS_LINES, LIV_ORG, LIV_SIGNATURE_IMAGE_PATH } from '@/lib/accreditation/draft-template';

export const runtime = 'nodejs';

/** Public Liv profile / help payload for Akkreditering UI. */
export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const profile = livProfileForUi();
  return NextResponse.json(
    createSuccessResponse(
      {
        ...profile,
        org: LIV_ORG,
        address: [...LIV_ADDRESS_LINES],
        signatureImagePath: LIV_SIGNATURE_IMAGE_PATH,
        help: {
          channels: [
            'Studio: indsæt event-URL + recipient + antal/adgang.',
            'Mail til liv@: kort brief eller flere events — én sag pr. koncert.',
          ],
          automation:
            'ON = ack + agent-loop + auto-send. OFF = ingest + drafts, ingen auto-outbound.',
          deliveryInvariant:
            'Godkendelse ≠ billetter modtaget ≠ billetter leveret til recipient.',
        },
        promptVersion: LIV_PROMPT_VERSION,
      },
      { requestId }
    )
  );
}
