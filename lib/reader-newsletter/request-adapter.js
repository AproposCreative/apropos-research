// Node Fetch request adaptation only. The three existing protocol modules stay
// byte-identical; SDK construction is supplied lazily by the Next Node route.
const {MAX_BODY_BYTES, readerNewsletterConfigFromEnvironment, createReaderNewsletterEndpoint} = require("./readerNewsletterEndpoint");
const BINDING = Object.freeze({projectID: "apropos-magazine-6004a", appID: "1:817066738308:ios:a9ee127ef2f6404a7ab8d1"});
const SAFE_HEADERS = Object.freeze({"cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff", "content-type": "application/json; charset=utf-8"});

function configuration(environment) {
  const config = readerNewsletterConfigFromEnvironment(environment, BINDING.projectID);
  // Writer rollback must not switch off Research's already accepted reader.
  return {...config, enabled: config.enabled === true && environment.READER_NEWSLETTER_SIGNUP_ENABLED === "true"
    && environment.READER_NEWSLETTER_APP_ID === BINDING.appID && environment.READER_NEWSLETTER_SOURCE_KIND === "research"};
}
function assertReaderNewsletterServiceIdentity(db, auth) {
  if (db === null || typeof db !== "object" || Reflect.get(db, "projectId") !== BINDING.projectID
      || auth === null || typeof auth !== "object") throw new Error("newsletter_service_identity_unavailable");
  const app = Reflect.get(auth, "app");
  if (app === null || typeof app !== "object") throw new Error("newsletter_service_identity_unavailable");
  const options = Reflect.get(app, "options");
  const appProjectID = options && typeof options === "object" ? Reflect.get(options, "projectId") : undefined;
  if (appProjectID !== undefined && appProjectID !== BINDING.projectID) throw new Error("newsletter_service_identity_mismatch");
  // getAdminDb/getAdminAuth share Research's existing initialized app. The real
  // Google Firestore object has projectId but no public app property; never
  // invent db.app equality or relabel an unknown database to pass this guard.
}
function failure(error, status) {
  return new Response(JSON.stringify({status: "unavailable", error, retryable: false}), {status, headers: SAFE_HEADERS});
}
function resultResponse(result) {
  return new Response(JSON.stringify(result.body), {status: result.status, headers: result.headers});
}
function cancelReader(reader) {
  // A hostile stream's cancellation hook may never settle. Revoke this read
  // locally and observe its eventual rejection without waiting for that hook.
  try { Promise.resolve(reader.cancel()).catch(() => {}); } catch { /* already closed */ }
}
function nextChunk(reader, signal) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const settle = (callback, value) => {
      if (finished) return; finished = true;
      signal?.removeEventListener("abort", aborted); callback(value);
    };
    const aborted = () => { settle(reject, Object.assign(new Error("request_aborted"), {code: "request_aborted"})); cancelReader(reader); };
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener("abort", aborted, {once: true});
    Promise.resolve().then(() => reader.read()).then((value) => settle(resolve, value), (error) => settle(reject, error));
    if (signal?.aborted) aborted();
  });
}
async function readBody(request) {
  if (request.signal?.aborted) throw Object.assign(new Error("request_aborted"), {code: "request_aborted"});
  if (request.body === null) return Buffer.alloc(0);
  const reader = request.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const chunk = await nextChunk(reader, request.signal);
      if (request.signal?.aborted) throw Object.assign(new Error("request_aborted"), {code: "request_aborted"});
      if (chunk.done) return Buffer.concat(chunks, length);
      if (!(chunk.value instanceof Uint8Array)) throw new Error("invalid_request");
      if (length + chunk.value.byteLength > MAX_BODY_BYTES) {
        cancelReader(reader); throw Object.assign(new Error("request_too_large"), {code: "request_too_large"});
      }
      // Copy only accepted bounded bytes; a later producer cannot mutate a
      // previously captured chunk while the rest of the request is being read.
      chunks.push(Buffer.from(chunk.value)); length += chunk.value.byteLength;
    }
  } finally { try { reader.releaseLock(); } catch { /* a cancelled old read may still be draining */ } }
}
function createReaderNewsletterRequestHandler({environment, createServices, createEndpoint = createReaderNewsletterEndpoint, now}) {
  const endpoint = createEndpoint({config: configuration(environment), createServices, ...(now ? {now} : {})});
  return async function handle(request) {
    let headers, query;
    try {
      if (request.signal?.aborted) return failure("request_aborted", 400);
      headers = Object.fromEntries(request.headers.entries());
      query = Object.fromEntries(new URL(request.url).searchParams.entries());
    } catch { return failure("invalid_request", 400); }
    const input = {method: request.method, query, headers, rawHeaders: Object.entries(headers).flat(), rawBody: Buffer.alloc(0)};
    // These core checks precede raw-body JSON parsing. They can return their
    // original method/query/header status without consuming an unbounded body.
    if (request.method !== "POST" || Object.keys(query).length || Object.keys(headers).length > 100
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(headers["content-type"] || "")
        || (headers["content-encoding"] && headers["content-encoding"] !== "identity")) {
      return resultResponse(await endpoint(input));
    }
    const declared = headers["content-length"];
    if (declared !== undefined && /^\d{1,6}$/.test(declared) && Number(declared) > MAX_BODY_BYTES) return failure("request_too_large", 413);
    try { input.rawBody = await readBody(request); }
    catch (error) { return failure(error?.code === "request_too_large" ? "request_too_large" : error?.code === "request_aborted" ? "request_aborted" : "invalid_request", error?.code === "request_too_large" ? 413 : 400); }
    if (request.signal?.aborted) return failure("request_aborted", 400);
    // Do not parse/rewrite JSON, requestID, auth fields or the protocol response.
    // Once admitted, the unchanged core finishes its journal even if a caller
    // disconnects; an unknown client outcome never releases a writing fence.
    return resultResponse(await endpoint(input));
  };
}
module.exports = {BINDING, MAX_BODY_BYTES, configuration, assertReaderNewsletterServiceIdentity, createReaderNewsletterRequestHandler};
