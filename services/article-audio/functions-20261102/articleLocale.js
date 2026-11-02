// Authoritative CMS identities; no text detection, transport or SDK initialization.
const ARTICLE_COLLECTION = "67dbf17ba540975b5b21c2a6";
const DANISH_LOCALE = "67dbf17ba540975b5b21c225";
const ENGLISH_ARTICLES_COLLECTION = "articles_en";
const ENGLISH_LOCALE = "690ca0f6b0d13d8788354156";
const RAW_ID = /^[a-f\d]{24}$/;
const ENGLISH_ID = /^en_[a-f\d]{24}$/;
function isEnglishMirror(id, data = {}) {
  return ENGLISH_ID.test(id || "") || data.contentLanguage === "en" || data.cmsLocaleId === ENGLISH_LOCALE;
}
function localeDocumentID(id, locale) {
  if (!RAW_ID.test(id)) throw new Error("Invalid localized CMS identifier");
  if (locale === ENGLISH_LOCALE) return `en_${id}`;
  if (locale === DANISH_LOCALE) return id;
  throw new Error("Unsupported article locale");
}
function ownedLocaleDocument(doc, collectionId, locale) {
  const data = doc.data;
  if (data.source !== "webflow" || data.sourceCollectionId !== collectionId) return null;
  if (locale === ENGLISH_LOCALE) {
    if (doc.mirrorCollection !== ENGLISH_ARTICLES_COLLECTION) return null;
    const raw = typeof data.sourceArticleID === "string" ? data.sourceArticleID : "";
    return RAW_ID.test(raw) && doc.id === `en_${raw}` && data.id === doc.id &&
      data.cmsLocaleId === locale && data.contentLanguage === "en" ? raw : null;
  }
  if (doc.mirrorCollection !== "articles" || isEnglishMirror(doc.id, data)) return null;
  // Only the established legacy DA representation may omit its locale.
  return RAW_ID.test(doc.id) && (data.id == null || data.id === doc.id) &&
    (data.sourceArticleID == null || data.sourceArticleID === doc.id) &&
    (data.cmsLocaleId == null || data.cmsLocaleId === DANISH_LOCALE) ? doc.id : null;
}

// Internal derived addresses only. Persisted source/binding shapes stay unchanged.
function narrationAddress(articleId, slug) {
  if (typeof articleId !== "string" || !(RAW_ID.test(articleId) || ENGLISH_ID.test(articleId)) ||
      typeof slug !== "string" || !/^[a-z0-9]+(?:-+[a-z0-9]+)*$/.test(slug) || slug.length > 240) throw new Error("Invalid narration identity");
  const english = ENGLISH_ID.test(articleId);
  return {english, language: english ? "en" : "da", rawID: english ? articleId.slice(3) : articleId,
    collection: english ? ENGLISH_ARTICLES_COLLECTION : "articles", locale: english ? ENGLISH_LOCALE : DANISH_LOCALE,
    stem: english ? articleId : slug, queueID: english ? articleId : slug,
    episodeID: english ? `ai-${articleId}` : `ai-${slug.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`};
}
function requireNarrationArticle(article, requestedID, slug) {
  const address = narrationAddress(article?.id, slug);
  if ((requestedID && requestedID !== article.id) || article.fieldData?.slug !== slug) throw new Error("Narration source identity mismatch");
  if (address.english) {
    if (article.sourceArticleID !== address.rawID || article.contentLanguage !== "en" || article.cmsLocaleId !== ENGLISH_LOCALE ||
        article.source !== "webflow" || article.sourceCollectionId !== ARTICLE_COLLECTION || article.mirrorOwner !== "apropos-en-live-v1" ||
        article.publicationState !== "live" || article.isDraft !== false || article.isArchived !== false) throw new Error("Unowned English narration source");
  } else if (isEnglishMirror(article.id, article)) throw new Error("Wrong narration locale");
  return address;
}
function sameNarrationNamespace(articleId, otherID) {
  return ENGLISH_ID.test(articleId || "") === ENGLISH_ID.test(otherID || "");
}
module.exports = {narrationAddress, requireNarrationArticle, sameNarrationNamespace, ARTICLE_COLLECTION, DANISH_LOCALE, ENGLISH_LOCALE, ENGLISH_ARTICLES_COLLECTION, isEnglishMirror,
  localeDocumentID, ownedLocaleDocument};
