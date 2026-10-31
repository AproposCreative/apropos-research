import { z } from 'zod';
import { MAX_TITLE_SUBTITLE_GAP } from './card-layout';
export const socialCardSchema = z.object({
  title: z.string().max(4000), excerpt: z.string().max(12000).optional(),
  theme: z.enum(['light', 'dark']).optional(), imageUrl: z.string().max(3000).nullable().optional(),
  titleSizePercent: z.number().int().min(70).max(150).optional(), subtitleSizePercent: z.number().int().min(70).max(150).optional(),
  titleSubtitleGap: z.number().int().min(0).max(MAX_TITLE_SUBTITLE_GAP).optional(),
  category: z.string().max(200).optional(), categorySecondary: z.string().max(200).optional(),
  eyebrowLabels: z.array(z.string().max(200)).max(8).optional(), storyBottomMetaLabels: z.array(z.string().max(200)).max(8).optional(),
  rating: z.number().int().min(0).max(6).optional(), caption: z.string().max(12000).optional(),
}).strict();
export const socialPublishSchema = z.object({
  requestId: z.string().uuid(), articleId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  imageUrl: z.string().url().max(3000), imageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  caption: z.string().max(2200).default(''), articleUrl: z.string().url().max(2000), isStory: z.boolean(),
  card: socialCardSchema,
  channels: z.object({ instagram: z.literal(true), facebook: z.boolean() }).strict(),
}).strict().refine(x => !x.isStory || !x.channels.facebook, 'Stories understøtter kun Instagram.');
export type SocialPublishInput = z.infer<typeof socialPublishSchema>;
export type PublishStage = 'pending' | 'sending' | 'published' | 'failed' | 'uncertain' | 'skipped';
export type ChannelReceipt = { status: PublishStage; id?: string; url?: string; error?: string; errorCode?: number; publishedAt?: string };
export type SocialPublishReceipt = {
  id: string; ownerUid: string; articleId: string; requestId: string;
  createdAt: string; updatedAt: string; complete: boolean; phase: string;
  channels: SocialPublishInput['channels']; instagram: ChannelReceipt; facebook: ChannelReceipt;
  comment: ChannelReceipt; containerId?: string;
  imageSha256: string; approved: Pick<SocialPublishInput, 'card' | 'caption' | 'articleUrl' | 'isStory'>;
};
export function publishIsUncertain(receipt: SocialPublishReceipt) {
  return [receipt.instagram, receipt.facebook, receipt.comment].some(x => x.status === 'uncertain' || x.status === 'sending');
}
