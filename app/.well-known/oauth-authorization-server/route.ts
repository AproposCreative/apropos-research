import { authorizationMetadata, PRIVATE_HEADERS } from '@/lib/mcp/config';
export const GET = () => Response.json(authorizationMetadata, { headers: PRIVATE_HEADERS });
