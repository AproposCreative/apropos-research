// Read-only Webflow live endpoints. Staged/old Firestore publication flags are
// insufficient authority for new paid synthesis or media publication.
const {contentRevision} = require("./webflowCatalog");
const {ARTICLE_COLLECTION, ENGLISH_LOCALE, narrationAddress} = require("./articleLocale");
function createPublishedCMSReader({fetch, apiKey, collectionID}) {
  if (typeof fetch !== "function" || !/^[a-f\d]{24}$/.test(collectionID || "")) throw new Error("Existing CMS reader required");
  async function get(suffix, absentAllowed = false) {
    const response = await fetch(`https://api.webflow.com/v2/collections/${collectionID}/${suffix}`, {
      method: "GET", headers: {Authorization: `Bearer ${apiKey()}`}, signal: AbortSignal.timeout(15000)});
    if (absentAllowed && response.status === 404) return null;
    if (!response.ok) throw new Error(`CMS publication could not be confirmed (${response.status})`);
    return response.json();
  }
  const validItem = item => /^[a-f\d]{24}$/.test(item?.id || "") && item?.fieldData && typeof item.fieldData === "object" && !Array.isArray(item.fieldData);
  const published = item => validItem(item) && item.isDraft === false && item.isArchived !== true && typeof item.lastPublished === "string" && Number.isFinite(Date.parse(item.lastPublished));
  async function englishJSON(suffix, absentAllowed = false, budget = {deadline: Date.now() + 90000, bytes: 0}) {
    if (collectionID !== ARTICLE_COLLECTION) throw new Error("English CMS collection mismatch");
    const remaining = budget.deadline - Date.now();
    if (remaining <= 0) throw new Error("English LIVE absolute deadline");
    const response = await fetch(`https://api.webflow.com/v2/collections/${collectionID}/${suffix}`, {
      method: "GET", redirect: "error", headers: {Authorization: `Bearer ${apiKey()}`}, signal: AbortSignal.timeout(Math.min(15000, remaining))});
    if (Date.now() >= budget.deadline) throw new Error("English LIVE absolute deadline");
    if (absentAllowed && response.status === 404) return null;
    if (!response.ok || response.redirected) throw new Error("English LIVE response unqualified");
    const reader = response.body?.getReader();
    if (!reader || !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:;|$)/i.test(response.headers?.get("content-type") || "")) throw new Error("English bounded JSON body required");
    const chunks = [];let bytes = 0;
    try {
      while (true) {
        if (Date.now() >= budget.deadline) throw new Error("English LIVE absolute deadline");
        const {done, value} = await reader.read();
        if (Date.now() >= budget.deadline) throw new Error("English LIVE absolute deadline");
        if (done) break;
        if (!(value instanceof Uint8Array) || (bytes += value.byteLength) > 4 * 1024 * 1024) throw new Error("English LIVE page byte bound");
        budget.bytes += value.byteLength;
        if (budget.bytes > 24 * 1024 * 1024) throw new Error("English LIVE cumulative byte bound");
        chunks.push(value);
      }
      return JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks, bytes)));
    } catch (error) {try {await reader.cancel();} catch {}throw error;}
  }
  function englishItem(item, expectedID) {
    if (!validItem(item) || (expectedID && item.id !== expectedID) || item.cmsLocaleId !== ENGLISH_LOCALE ||
        typeof item.isDraft !== "boolean" || typeof item.isArchived !== "boolean" ||
        typeof item.lastPublished !== "string" || !Number.isFinite(Date.parse(item.lastPublished))) throw new Error("English LIVE identity mismatch");
    if (item.isArchived) return null;
    return {...item, id: `en_${item.id}`, sourceArticleID: item.id, contentLanguage: "en", cmsLocaleId: ENGLISH_LOCALE,
      source: "webflow", sourceCollectionId: collectionID, mirrorOwner: "apropos-en-live-v1", publicationState: "live",
      isDraft: false, isArchived: false, contentRevision: contentRevision(item)};
  }
  return {
    async allEnglish() {
      const all = [], ids = new Set(), budget = {deadline: Date.now() + 90000, bytes: 0};let offset = 0, total;
      for (let pages = 0; pages < 10; pages++) {
        const page = await englishJSON(`items/live?cmsLocaleId=${ENGLISH_LOCALE}&limit=100&offset=${offset}&sortBy=createdOn&sortOrder=asc`, false, budget);
        const p = page?.pagination, rows = page?.items;
        if (!Array.isArray(rows) || !Number.isSafeInteger(p?.total) || p.total < 0 || p.total > 1000 ||
            (total !== undefined && total !== p.total) || p.offset !== offset || p.limit !== 100 || rows.length > 100 ||
            offset + rows.length > p.total || (offset + rows.length < p.total && rows.length !== 100)) throw new Error("English LIVE inventory incomplete");
        total = p.total;
        for (const item of rows) {if (!validItem(item) || ids.has(item.id)) throw new Error("English LIVE duplicate ID");ids.add(item.id);const en = englishItem(item);if (en) all.push(en);}
        offset += rows.length;if (offset === total) return all;
      }
      throw new Error("English LIVE page bound");
    },
    async one(id) {
      if (/^en_[a-f\d]{24}$/.test(id || "")) {
        const raw = id.slice(3), item = await englishJSON(`items/${raw}/live?cmsLocaleId=${ENGLISH_LOCALE}`, true);
        return item ? englishItem(item, raw) : null;
      }
      if (!/^[a-f\d]{24}$/.test(id || "")) throw new Error("Canonical CMS ID required");
      const item = await get(`items/${id}/live`, true);
      return item && item.id === id && published(item) ? {...item, contentRevision: contentRevision(item)} : null;
    },
    async all() {
      const all = [], ids = new Set();let offset = 0, expectedTotal;
      while (true) {
        const page = await get(`items/live?limit=100&offset=${offset}`);
        if (!Array.isArray(page?.items) || !Number.isSafeInteger(page.pagination?.total) || page.pagination.total < 0 || page.pagination.total > 10000 ||
            (expectedTotal !== undefined && page.pagination.total !== expectedTotal) ||
            page.pagination.offset !== offset || page.items.length > 100 || offset + page.items.length > page.pagination.total) throw new Error("Incomplete live CMS inventory");
        expectedTotal = page.pagination.total;
        for (const item of page.items) {
          if (!validItem(item) || ids.has(item.id)) throw new Error("Ambiguous live CMS inventory");
          ids.add(item.id);if (published(item)) all.push({...item, contentRevision: contentRevision(item)});
        }
        offset += page.items.length;
        if (offset >= page.pagination.total) return all;
        if (!page.items.length) throw new Error("Truncated live CMS inventory");
      }
    },
  };
}
module.exports = {createPublishedCMSReader};
