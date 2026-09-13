# Isolated operations-card verification

Executed `node scripts/verify-liv-operations-view.mjs` on September 13.
Uses the actual LivOperations React component and compiled project Tailwind CSS.
Auth and API are test fixtures; all non-local requests are blocked. No production
credentials, paid models, CMS publication or newsletters are used.

390x844 and 1280x900 each passed four scenarios: known usage, null usage,
unavailable budget section and HTTP 503. Each showed the expected text, one initial
GET plus one manual refresh GET, zero page errors and no horizontal overflow.
The browser and temporary local HTTP server close after the run.

Screenshots are generated under tmp/liv-operations-visual. Mobile unknown-usage
and desktop known-usage screenshots were visually inspected: readable card,
aligned border, visible update button, no clipped text. The test shell uses Arial,
not the production Poppins font. This proves the isolated component and refresh
flow, not the full production settings shell, navigation or authentication UI.

Agent-browser CLI was unavailable. Existing Playwright and installed Chrome were
used instead; no browser download or dependency installation was needed.
