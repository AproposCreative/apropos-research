// Fetch/stream adapter checks only. No Firebase SDK is imported or initialized.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {createHash} = require("node:crypto");
const {BINDING, MAX_BODY_BYTES, configuration, assertReaderNewsletterServiceIdentity,
  createReaderNewsletterRequestHandler} = require("../lib/reader-newsletter/request-adapter");
const PROJECT = BINDING.projectID, APP = BINDING.appID;
const UID = "fixture-reader", EMAIL = "reader@example.invalid", REQUEST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = Date.parse("2026-10-31T12:00:00Z");
const flags = (extra = {}) => ({READER_NEWSLETTER_ENABLED: "true", READER_NEWSLETTER_SIGNUP_ENABLED: "true",
  READER_NEWSLETTER_AUDIENCE_REVIEWED: "true", READER_NEWSLETTER_SUPPRESSION_REVIEWED: "true",
  READER_NEWSLETTER_APP_ID: APP, READER_NEWSLETTER_AUDIENCE_PROJECT_ID: PROJECT,
  READER_NEWSLETTER_SUPPRESSION_PROJECT_ID: PROJECT, READER_NEWSLETTER_SOURCE_KIND: "research", ...extra});
const payload = (extra = {}) => ({requestID: REQUEST, expectedUserID: UID, expectedEmail: EMAIL,
  consent: true, consentVersion: "apropos-newsletter-v1", source: "ios-onboarding", ...extra});
const headers = (extra = {}) => ({"content-type": "application/json", authorization: "Bearer fixture.id.token",
  "x-firebase-appcheck": "fixture.app.token", ...extra});
function request({raw, body = payload(), method = "POST", url = "https://fixture.invalid/api/reader-newsletter/signup", header, signal} = {}) {
  const init = {method, headers: header || headers(), signal};
  if (method !== "GET" && method !== "HEAD") init.body = raw === undefined ? JSON.stringify(body) : raw;
  if (init.body instanceof ReadableStream) init.duplex = "half";
  return new Request(url, init);
}
function fixture({environment = flags(), projectID = PROJECT, app = {options: {projectId: PROJECT}}} = {}) {
  const docs = new Map(), calls = {services: 0, appCheckConstruction: 0, appCheck: 0, auth: 0, user: 0, memberWrites: 0};
  let failMemberRead = false, replay = false, suppressionRevision = 0;
  const clone = (x) => structuredClone(x);
  const snapshot = (path) => ({exists: docs.has(path), data: () => clone(docs.get(path)), updateTime: {seconds: NOW / 1000, nanoseconds: suppressionRevision}});
  const ref = (path) => ({path, get: async () => {
    if (failMemberRead && path.startsWith("reader_newsletter_subscribers/") && docs.has(path)) throw new Error("private readback failure");
    return snapshot(path);
  }});
  const db = {projectId: projectID, collection: (path) => ({doc: (id) => ref(`${path}/${id}`)}),
    runTransaction: async (body) => {
      const writes = []; let wrote = false;
      const value = await body({get: async (r) => { assert.equal(wrote, false); return snapshot(r.path); },
        set: (r, data) => { wrote = true; writes.push(() => { if (r.path.startsWith("reader_newsletter_subscribers/")) calls.memberWrites++; docs.set(r.path, clone(data)); }); },
        delete: (r) => { wrote = true; writes.push(() => docs.delete(r.path)); }});
      for (const write of writes) write(); return value;
    }};
  const auth = {app, verifyIdToken: async (token, revoked) => {
    calls.auth++; assert.equal(token, "fixture.id.token"); assert.equal(revoked, true);
    return {uid: UID, sub: UID, email: EMAIL, email_verified: true, aud: PROJECT,
      iss: `https://securetoken.google.com/${PROJECT}`, iat: NOW / 1000 - 1, exp: NOW / 1000 + 3600,
      auth_time: NOW / 1000 - 20, firebase: {sign_in_provider: "google.com"}};
  }, getUser: async (uid) => { calls.user++; return {uid, email: EMAIL, emailVerified: true, disabled: false}; }};
  const createServices = () => {
    calls.services++; assertReaderNewsletterServiceIdentity(db, auth); calls.appCheckConstruction++;
    return {db, auth, appCheck: {verifyToken: async (token, options) => {
      calls.appCheck++; assert.equal(token, "fixture.app.token"); assert.deepEqual(options, {consume: true});
      const projectNumber = APP.split(":")[1];
      return {alreadyConsumed: replay, appId: APP, token: {sub: APP, app_id: APP,
        iss: `https://firebaseappcheck.googleapis.com/${projectNumber}`, aud: [`projects/${PROJECT}`],
        iat: NOW / 1000 - 1, exp: NOW / 1000 + 3600}};
    }}};
  };
  return {handler: createReaderNewsletterRequestHandler({environment, createServices, now: () => NOW}),
    docs, calls, unsubscribeAgain: () => { suppressionRevision++; docs.set(`newsletter_unsubscribes/${EMAIL}`, {email: EMAIL, unsubscribedAt: new Date(NOW).toISOString()}); }, failMemberRead: () => { failMemberRead = true; }, recoverMemberRead: () => { failMemberRead = false; },
    replay: () => { replay = true; }};
}
const memberKey = () => `reader_newsletter_subscribers/${createHash("sha256").update(EMAIL).digest("hex")}`;
function stubHandler() {
  const captured = [], configs = [];
  const handler = createReaderNewsletterRequestHandler({environment: flags(), createServices: () => { throw new Error("Unexpected SDK boundary"); },
    createEndpoint: (options) => { configs.push(options.config); return async (input) => {
      captured.push(input);
      return {status: 429, headers: {"cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff",
        "content-type": "application/json; charset=utf-8", "retry-after": "17"},
      body: {status: "unavailable", requestID: REQUEST, error: "rate_limited", retryable: true}};
    }; }});
  return {handler, captured, configs};
}

test("both reader and independent writer flags plus exact fixed binding are required", () => {
  assert.equal(configuration(flags()).enabled, true);
  for (const [key, value] of [["READER_NEWSLETTER_ENABLED", "false"], ["READER_NEWSLETTER_SIGNUP_ENABLED", undefined],
    ["READER_NEWSLETTER_SIGNUP_ENABLED", "TRUE"], ["READER_NEWSLETTER_APP_ID", "1:123456789:ios:abcdef"],
    ["READER_NEWSLETTER_SOURCE_KIND", undefined]]) assert.equal(configuration(flags({[key]: value})).enabled, false);
  const reader = flags({READER_NEWSLETTER_SIGNUP_ENABLED: "false"}); configuration(reader);
  assert.equal(reader.READER_NEWSLETTER_ENABLED, "true", "Writer rollback never changes the recipient reader flag");
});
test("default-off or reader/writer-disabled valid requests return matching unavailable receipt without services", async () => {
  for (const environment of [{}, flags({READER_NEWSLETTER_ENABLED: "false"}), flags({READER_NEWSLETTER_SIGNUP_ENABLED: "false"}),
    flags({READER_NEWSLETTER_SUPPRESSION_REVIEWED: "false"}), flags({READER_NEWSLETTER_AUDIENCE_PROJECT_ID: "other-project"})]) {
    const f = fixture({environment}), response = await f.handler(request());
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), {status: "unavailable", requestID: REQUEST});
    assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(f.calls.services, 0); assert.equal(f.docs.size, 0);
  }
});
test("method query and unsupported headers keep core statuses with no SDK construction", async () => {
  for (const [args, status] of [[{method: "GET"}, 405], [{url: "https://fixture.invalid/api/reader-newsletter/signup?x=1"}, 400],
    [{header: headers({"content-type": "text/plain"})}, 415], [{header: headers({"content-encoding": "gzip"})}, 415]]) {
    const f = fixture(), response = await f.handler(request(args)); assert.equal(response.status, status);
    if (status === 405) assert.equal(response.headers.get("allow"), "POST");
    assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(f.calls.services, 0);
  }
});
test("uncredentialled active request is rejected before any SDK boundary", async () => {
  for (const header of [{"content-type": "application/json"}, headers({authorization: "Bearer one, Bearer two"}), headers({"x-firebase-appcheck": ""})]) {
    const f = fixture(), response = await f.handler(request({header})); assert.equal(response.status, 401); assert.equal(f.calls.services, 0);
  }
});
test("Fetch Headers comma-folded duplicate credentials and content headers fail closed before services or stores", async () => {
  const raw = JSON.stringify(payload());
  const cases = [
    ["authorization", "Bearer fixture.id.token", 401],
    ["x-firebase-appcheck", "fixture.app.token", 401],
    ["content-type", "application/json", 415],
    ["content-length", String(Buffer.byteLength(raw)), 400],
  ];
  for (const [name, value, status] of cases) {
    // Exercise real Fetch normalization rather than supplying a pre-folded
    // string or inventing access to wire-level rawHeaders in a Next Request.
    const pairs = Object.entries(headers()).filter(([key]) => key !== name);
    const folded = new Headers([...pairs, [name, value], [name.toUpperCase(), value]]);
    assert.equal(folded.get(name), `${value}, ${value}`, `${name}: actual comma folding`);
    const f = fixture(), response = await f.handler(request({raw, header: folded}));
    assert.equal(response.status, status, name);
    assert.equal((await response.json()).status, "unavailable", name);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(f.calls, {services: 0, appCheckConstruction: 0, appCheck: 0,
      auth: 0, user: 0, memberWrites: 0}, `${name}: no SDK/service boundary`);
    assert.equal(f.docs.size, 0, `${name}: no admission, journal, suppression or membership store writes`);
  }
});
test("malformed JSON invalid UTF8 and declared length mismatch remain core failures with no SDK", async () => {
  for (const args of [{raw: "not-json"}, {raw: Buffer.from([0xff])}, {header: headers({"content-length": "1"})}]) {
    const f = fixture(), response = await f.handler(request(args)); assert.equal(response.status, 400);
    assert.equal(f.calls.services, 0); assert.equal(f.docs.size, 0);
  }
});
test("adapter passes raw bytes without JSON parsing and preserves status requestID and retry-after", async () => {
  const f = stubHandler(), response = await f.handler(request({raw: "not-json"}));
  assert.equal(f.captured.length, 1); assert.deepEqual(f.captured[0].rawBody, Buffer.from("not-json"));
  assert.equal(response.status, 429); assert.equal(response.headers.get("retry-after"), "17");
  assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal((await response.json()).requestID, REQUEST);
});
test("exact4096 UTF8bytes reach core even when character count is2048", async () => {
  const f = stubHandler(), raw = "æ".repeat(MAX_BODY_BYTES / 2); assert.equal(Buffer.byteLength(raw), 4096);
  const response = await f.handler(request({raw})); assert.equal(response.status, 429); assert.equal(f.captured[0].rawBody.length, 4096);
});
test("stream exceeding4096bytes is cancelled before core or SDK", async () => {
  let cancelled = 0;
  const body = new ReadableStream({start(c) { c.enqueue(Buffer.from("æ".repeat(2048))); c.enqueue(Buffer.from("x")); }, cancel() { cancelled++; }});
  const f = fixture(), response = await f.handler(request({raw: body}));
  assert.equal(response.status, 413); assert.equal((await response.json()).error, "request_too_large");
  assert.equal(cancelled, 1); assert.equal(f.calls.services, 0); assert.equal(f.docs.size, 0);
});
test("declared oversize is rejected before opening raw stream", async () => {
  const f = fixture(); let readers = 0;
  const response = await f.handler({method: "POST", url: "https://fixture.invalid/api/reader-newsletter/signup", headers: new Headers(headers({"content-length": "4097"})),
    signal: new AbortController().signal, body: {getReader() { readers++; throw new Error("must not open"); }}});
  assert.equal(response.status, 413); assert.equal(readers, 0); assert.equal(f.calls.services, 0);
});
test("already aborted request never reads or initializes services", async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  const response = await f.handler(request({signal: controller.signal})); assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "request_aborted"); assert.equal(f.calls.services, 0);
});
test("abort during held raw read returns immediately and ignores late bytes after nonsettling cancellation", async () => {
  const f = fixture(), controller = new AbortController(); let finishRead, readStarted, cancels = 0;
  const started = new Promise((resolve) => { readStarted = resolve; });
  const reader = {read: () => { readStarted(); return new Promise((resolve) => { finishRead = resolve; }); },
    cancel: () => { cancels++; return new Promise(() => {}); }, releaseLock() {}};
  const operation = f.handler({method: "POST", url: "https://fixture.invalid/api/reader-newsletter/signup", headers: new Headers(headers()),
    signal: controller.signal, body: {getReader: () => reader}});
  await started; controller.abort(); const response = await operation;
  assert.equal(response.status, 400); assert.equal((await response.json()).error, "request_aborted"); assert.equal(cancels, 1);
  finishRead({done: false, value: Buffer.from(JSON.stringify(payload()))}); await new Promise(setImmediate);
  assert.equal(f.calls.services, 0); assert.equal(f.docs.size, 0);
});
test("broken locked reader produces safe malformed response without leaking source error", async () => {
  const f = fixture(); const response = await f.handler({method: "POST", url: "https://fixture.invalid/api/reader-newsletter/signup", headers: new Headers(headers()),
    signal: new AbortController().signal, body: {getReader() { throw new Error("private token details"); }}});
  assert.equal(response.status, 400); assert.deepEqual(await response.json(), {status: "unavailable", error: "invalid_request", retryable: false});
  assert.equal(f.calls.services, 0);
});
test("real core writes authoritative membership and matching HTTP receipt through injected local services", async () => {
  const f = fixture(), response = await f.handler(request()); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {status: "subscribed", requestID: REQUEST});
  assert.equal(f.calls.appCheck, 1); assert.equal(f.calls.auth, 1); assert.equal(f.calls.user, 1); assert.equal(f.calls.memberWrites, 1);
  assert.equal(f.docs.get(memberKey()).email, EMAIL); assert.equal(f.docs.get(memberKey()).consentVersion, "apropos-newsletter-v1");
  assert.ok(![...f.docs.keys()].some((key) => key.startsWith("newsletter_unsubscribes/")));
});
test("real core rejects consumed AppCheck before Auth or any journal membership write", async () => {
  const f = fixture(); f.replay(); const response = await f.handler(request()); assert.equal(response.status, 401);
  assert.equal((await response.json()).requestID, REQUEST); assert.equal(f.calls.appCheck, 1); assert.equal(f.calls.auth, 0); assert.equal(f.docs.size, 0);
});
test("real core cannot transfer a valid token into another expected account", async () => {
  const f = fixture(), response = await f.handler(request({body: payload({expectedUserID: "different-reader"})}));
  assert.equal(response.status, 401); assert.equal(f.calls.memberWrites, 0); assert.equal(f.docs.has(memberKey()), false);
});
test("matching retry is idempotent and preserves the original persisted member bytes", async () => {
  const f = fixture(); const first = await f.handler(request()); assert.equal(first.status, 200); const before = structuredClone(f.docs.get(memberKey()));
  const second = await f.handler(request()); assert.equal(second.status, 200); assert.equal((await second.json()).requestID, REQUEST);
  assert.deepEqual(f.docs.get(memberKey()), before); assert.equal(f.calls.memberWrites, 1);
});
test("lost postcommit member read remains pending/fenced then same-request retry confirms actual existing member", async () => {
  const f = fixture(); f.failMemberRead(); const first = await f.handler(request()); assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {status: "pending", requestID: REQUEST}); assert.equal(f.calls.memberWrites, 1);
  const lock = [...f.docs.entries()].find(([key]) => key.startsWith("reader_newsletter_signup_locks/"))[1];
  assert.equal(lock.phase, "writing"); assert.equal(lock.expiresAtMs, null); const member = structuredClone(f.docs.get(memberKey()));
  f.recoverMemberRead(); const retry = await f.handler(request()); assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), {status: "alreadySubscribed", requestID: REQUEST}); assert.equal(f.calls.memberWrites, 1);
  assert.deepEqual(f.docs.get(memberKey()), member);
});
test("wrong resolved database or unknown/mismatched app rejects before AppCheck Auth or store calls", async () => {
  for (const args of [{projectID: "different-project"}, {app: undefined}, {app: null}, {app: {options: {projectId: "different-project"}}}]) {
    // Explicit undefined does not survive JS default destructuring; exercise an
    // absent-app value directly too rather than treating it as accepted proof.
    if (args.app === undefined && Object.hasOwn(args, "app")) { assert.throws(() => assertReaderNewsletterServiceIdentity({projectId: PROJECT}, {})); continue; }
    const f = fixture(args), response = await f.handler(request()); assert.equal(response.status, 503);
    assert.equal(f.calls.appCheckConstruction, 0); assert.equal(f.calls.appCheck, 0); assert.equal(f.calls.auth, 0); assert.equal(f.docs.size, 0);
  }
  const certificateBranch = fixture({app: {options: {}}});
  assert.equal((await certificateBranch.handler(request())).status, 200, "ActualDBproject from existing same-app helper remains authoritative when App.options.projectId absent");
});

// Current Fetch wrapper plus the actual candidate core; no mail/provider SDK.
test("modern Fetch optin requires an explicit token request and preserves a later unsubscribe", async () => {
  const f = fixture(); f.unsubscribeAgain();
  const first = await f.handler(request({body: payload({reconfirmationChallenge: null})}));
  assert.equal(first.status, 200); const challenge = await first.json();
  assert.equal(challenge.status, "reconfirmationRequired");
  assert.equal(challenge.requestID, REQUEST);
  assert.match(challenge.reconfirmationChallenge, /^[a-f0-9-]{36}$/);
  assert.equal(f.calls.memberWrites, 0);
  assert.equal(f.docs.has(`newsletter_unsubscribes/${EMAIL}`), true);
  const confirmedBody = payload({reconfirmationChallenge: challenge.reconfirmationChallenge});
  const confirmed = await f.handler(request({body: confirmedBody}));
  assert.equal(confirmed.status, 200);
  assert.deepEqual(await confirmed.json(), {status: "subscribed", requestID: REQUEST});
  assert.equal(f.calls.memberWrites, 1);
  assert.equal(f.docs.has(`newsletter_unsubscribes/${EMAIL}`), false);
  const duplicate = await f.handler(request({body: confirmedBody}));
  assert.deepEqual(await duplicate.json(), {status: "subscribed", requestID: REQUEST});
  assert.equal(f.calls.memberWrites, 1);
  f.unsubscribeAgain();
  const oldReplay = await f.handler(request({body: confirmedBody}));
  assert.deepEqual(await oldReplay.json(), {status: "reconfirmationRequired", requestID: REQUEST});
  assert.equal(f.docs.has(`newsletter_unsubscribes/${EMAIL}`), true);
  assert.equal(f.calls.memberWrites, 1);
});
