import { editorialRequestAccess } from '@/lib/editorial-access';

/** Image-gen is a private Frederik-only pilot until it is explicitly released to the team. */
export async function imageGenRequestAccess(request: Request) {
  const access = await editorialRequestAccess(request);
  return access?.owner ? access : null;
}
