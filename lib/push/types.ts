export type PushAudience = 'all_users' | 'new_articles';

export type PushDestinationKind = 'none' | 'article' | 'podcast';

export type PushSendInput = {
  title: string;
  body?: string;
  imageUrl?: string;
  destination: PushDestinationKind;
  articleSlug?: string;
  audience?: PushAudience;
};

export type PushSendResult = {
  messageId: string;
  topic: string;
  destination: PushDestinationKind;
  articleSlug?: string;
  articleId?: string;
};
