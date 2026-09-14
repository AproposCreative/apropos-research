import { createHash } from 'node:crypto';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { imageGenCmsConfiguration } from './webflow';

export type ImageGenCmsAsset = { id: string; url: string };
export async function uploadImageGenCmsAsset(bytes: Buffer, name: string, checkpoint: (asset: ImageGenCmsAsset) => Promise<void>) {
  if (!/^apropos-[a-f0-9]{64}\.webp$/.test(name) || !bytes.length || bytes.length > 500_000) throw new Error('image_gen_upload_invalid');
  const { token, site } = imageGenCmsConfiguration();
  if (!/^[a-f0-9]{24}$/.test(site || '')) throw new Error('image_gen_cms_unconfigured');
  const allocated = await fetch(`https://api.webflow.com/v2/sites/${site}/assets`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: name, fileHash: createHash('md5').update(bytes).digest('hex') }),
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!allocated.ok) throw new Error('image_gen_asset_allocate_failed');
  const data = await allocated.json();
  const upload = new URL(data.uploadUrl), hosted = new URL(data.hostedUrl);
  if (upload.protocol !== 'https:' || upload.username || upload.password || upload.port || upload.search ||
      !['webflow-prod-assets.s3.amazonaws.com', 's3.amazonaws.com'].includes(upload.hostname) ||
      (upload.hostname === 's3.amazonaws.com' && !upload.pathname.startsWith('/webflow-prod-assets/')) ||
      hosted.protocol !== 'https:' || hosted.username || hosted.password || hosted.port ||
      !['cdn.prod.website-files.com', 'uploads-ssl.webflow.com'].includes(hosted.hostname) ||
      !/^[a-f0-9]{24}$/.test(data.id) || !data.uploadDetails || typeof data.uploadDetails !== 'object') throw new Error('image_gen_upload_destination_invalid');
  const result = { id: data.id as string, url: hosted.href };
  // Preserve the CMS identity even when the following transport is interrupted.
  await checkpoint(result);
  const fields: Record<string, string> = { xAmzAlgorithm: 'X-Amz-Algorithm', xAmzCredential: 'X-Amz-Credential',
    xAmzDate: 'X-Amz-Date', xAmzSignature: 'X-Amz-Signature', successActionStatus: 'success_action_status',
    contentType: 'Content-Type', cacheControl: 'Cache-Control' };
  const form = new FormData();
  for (const [key, value] of Object.entries(data.uploadDetails)) {
    if (typeof value !== 'string') throw new Error('image_gen_upload_details_invalid');
    form.append(fields[key] || key, value);
  }
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/webp' }), name);
  const response = await fetch(upload, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (response.status !== 201 && response.status !== 204) throw new Error('image_gen_upload_uncertain');
  const readback = await readPublicMedia(hosted.href, 'image');
  if (!readback.equals(bytes)) throw new Error('image_gen_upload_readback_failed');
  return result;
}
