// Canonical subscriber membership for the existing Research newsletter sender.
// These documents are recipients, not pending intents or a second delivery queue.
// Activation also requires the matching Research recipient-reader/suppression patch.
const {createHash} = require("node:crypto");
const {normalizeEmail, CONSENT_VERSION, SOURCE} = require("./readerNewsletterSignup");
const SUBSCRIBERS = "reader_newsletter_subscribers", SUPPRESSION = "newsletter_unsubscribes";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROJECT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
class NewsletterAudienceError extends Error {
  constructor(code) {super(code);this.code = code;}
}
const fail = (code) => {throw new NewsletterAudienceError(code);};
const subscriberID = (email) => createHash("sha256").update(email).digest("hex");
function validateSubscriber(row, id, email) {
  if (!row || typeof row !== "object" || Array.isArray(row) ||
      Object.keys(row).some((key) => !["schemaVersion", "email", "source", "consentVersion", "requestID", "subscribedAtMs"].includes(key)) ||
      row.schemaVersion !== 1 || row.email !== email ||
      normalizeEmail(row.email) !== row.email || id !== subscriberID(row.email) || row.source !== SOURCE || row.consentVersion !== CONSENT_VERSION ||
      !UUID.test(row.requestID || "") || !Number.isSafeInteger(row.subscribedAtMs) || row.subscribedAtMs <= 0) fail("invalid_audience_record");
  return {itemID: id, email};
}
function createReaderNewsletterAudience({enabled = false, confirmedSource = false, db, runtimeProjectID, audienceProjectID,
  suppressionProjectID, now = Date.now} = {}) {
  const ready = (value) => {
    if (enabled !== true || confirmedSource !== true || typeof db?.collection !== "function" || typeof db?.runTransaction !== "function" ||
        !PROJECT.test(runtimeProjectID || "") || audienceProjectID !== runtimeProjectID || suppressionProjectID !== runtimeProjectID) fail("audience_unavailable");
    const email = normalizeEmail(value);
    // Research's existing suppression key is the normalized email document ID.
    if (!email || email.includes("/")) fail("invalid_subscriber_email");
    return email;
  };
  const inspect = (snapshot, id, email) => {
    if (typeof snapshot?.exists !== "boolean" || typeof snapshot.data !== "function") fail("audience_unavailable");
    if (!snapshot.exists) return null;
    return validateSubscriber(snapshot.data(), id, email);
  };
  const find = async (value) => {
    const email = ready(value), id = subscriberID(email);
    try {return inspect(await db.collection(SUBSCRIBERS).doc(id).get(), id, email);}
    catch (error) {if (error instanceof NewsletterAudienceError) throw error;fail("audience_unavailable");}
  };
  return {
    // This capability is server-owned. Transactional create of the same exact
    // document can be retried safely after uncertain Firestore responses.
    idempotentCreate: true,
    find,
    async create(value, requestID) {
      const email = ready(value), id = subscriberID(email);
      if (!UUID.test(requestID || "")) fail("invalid_signup_request");
      const ref = db.collection(SUBSCRIBERS).doc(id), suppressionRef = db.collection(SUPPRESSION).doc(email);
      try {
        await db.runTransaction(async (tx) => {
          const [recipient, suppressed] = await Promise.all([tx.get(ref), tx.get(suppressionRef)]);
          if (typeof suppressed?.exists !== "boolean") fail("audience_unavailable");
          if (suppressed.exists) fail("audience_suppressed");
          const existing = inspect(recipient, id, email);
          if (existing) return;
          const time = now();if (!Number.isSafeInteger(time) || time <= 0) fail("audience_unavailable");
          tx.set(ref, {schemaVersion: 1, email, source: SOURCE, consentVersion: CONSENT_VERSION, requestID, subscribedAtMs: time});
        });
        // Confirm persisted source membership after the transaction. A lost
        // commit/readback response remains pending in the independent journal.
        const persisted = await find(email);
        if (!persisted) fail("audience_outcome_unknown");
        return persisted;
      } catch (error) {
        if (error instanceof NewsletterAudienceError) throw error;
        fail("audience_outcome_unknown");
      }
    },
  };
}
module.exports = {SUBSCRIBERS, SUPPRESSION, NewsletterAudienceError, subscriberID, validateSubscriber, createReaderNewsletterAudience};
