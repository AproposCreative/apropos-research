# Production Liv settings verification

September 13, 2026, around 18:22 Europe/Copenhagen. Actual production app at
`https://ai.aproposmagazine.com/ai?view=liv`, visible build `b903348`.
Used existing authenticated browser session, not injected fixture data.

Browser skill CLI unavailable; supported in-app browser used for UI-only checks.
No publication, generation, approval, rejection, configuration save or CMS action
was performed. No session credentials extracted. Production runtime remains API-only.

Verified:
- Gear opens settings from Liv; Research, Advanced operations, collapsed budget
  and read-only operations panel render together in the actual application shell.
- Operations finishes loading and shows automatic Liv enabled and today's
  publication registered; newsletter W37 has 14 sent, zero errors.
- Budget shows 47.00 DKK registered out of 300, explicitly partial coverage.
  Expanding its disclosure shows zero reserved and 253 remaining; no setting changed.
- Desktop screenshot shows aligned settings cards and working inner scrolling.
- At 390x844 mobile viewport, scrolling reaches the full operations panel, text
  wraps within the cards and fixed header/back navigation remain usable.
- Back to stories loads all three upcoming stories, with images, dates, type,
  headline and approval/rejection controls. Klovn's revised Anmeldelse headline
  and two-of-six rating are visible.
- Mobile DOM readback: innerWidth=390, documentElement.scrollWidth=390.

Temporary viewport override reset and verification tab closed. Existing user tab
left untouched. This proves the observed administrator UI path, not all roles,
all error states, exact automatic publication timestamp or account-wide spend.
