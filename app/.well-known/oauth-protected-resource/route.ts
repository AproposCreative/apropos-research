import { protectedMetadata, PRIVATE_HEADERS } from '@/lib/mcp/config';
export const GET = () => Response.json(protectedMetadata, { headers: PRIVATE_HEADERS });
