# BotolaGO+ admin screen: brief

Lane H of the BotolaGO+ delivery plan. Owner-approved scope: the `/admin/plus` screen in the
existing admin shell (plan section 5.9, phase 4). Built straight in code, on its own branch
(`claude/plus-admin`), per `AGENTS.md` "Screen work". Nothing here is switched on: the screen
reads what lane B's functions answer, and those answer `mode = 'off'` until the owner changes it.

## What must be preserved

- The admin shell: route guard through a server loader (`loadAdminRouteAccessForPermission`),
  the section chips filtered on the caller's permissions, the `AdminFunctionalRoute` layout,
  the `AdminSurfaces` kit pieces and the `ui-kit` tokens. No new visual language.
- The admin register: French and Arabic text written next to the component as
  `rtl ? "..." : "..."` pairs, dates formatted as in the user directory (Latin digits), LTR data
  (ids, product codes, timestamps) wrapped in `AdminDatum`.
- The security model, all of it in the database and unchanged: `premium.read` for the overview
  and the audited member read, `premium.grant` (recent authentication) for grant and revoke,
  MFA (AAL2), audit rows, idempotency keys. The page decides what to offer, never what is allowed.
- Owner decisions: one admin with recent authentication, a reason and an audit row is enough for
  a grant (no dual control); staff test purchases count as membership in preview.
- Business logic: membership states, the state machine, `has_premium`, prices. The screen shows
  them; it computes none of them.
- No customer card data, no Fantasy data and no payment card data on this page, ever. Billing
  events show outcomes only; raw payloads are never selected by the functions and never shown.

## Improvements (what the screen adds)

1. **Overview, counts only.** Members by state (active, cancelling, grace, on hold, expired,
   refunded or revoked), a total of live comps, and the members by product (monthly, yearly).
   No member list by default.
2. **Switches, read-only.** The current mode (off, preview, on), whether checkout is enabled and
   whether billing is paused, with a plain sentence for each. Changed only by owner scripts.
3. **Products and prices, read-only.** Each product with its price as the API returns it
   (for the plan: 20 MAD a month, 200 MAD a year). Nothing about prices is written in the screen.
4. **Member lookup, the audited read.** By account id or by exact e-mail, with a reason of 8 to
   500 characters (the audit reason). Shows state, product, source, period dates, grants, and the
   billing event timeline (last 20: outcome, state before and after, amount; no payload).
5. **Grant and revoke.** A complimentary membership for 30 days, 90 days, a year (at most 400
   days, the database bound); revoke a live grant now. Each goes through the in-page confirm step
   used elsewhere in the admin (names the account and the consequence, asks for the reason, a
   second explicit press). Errors are shown plainly in the reader's language, including "sign in
   again" when recent authentication has lapsed.
6. A development-only sample route (`/dev/plus-admin-sample`, not found outside a dev server),
   like the player-mapping sample, so the screen can be looked at and measured without a
   database. It serves invented accounts from memory.

## Acceptance criteria

Functional

- The route is reachable only by staff with `premium.read`; others get the admin refusal panel.
  The nav chip appears only for that permission. Grant and revoke controls are drawn only with
  `premium.grant`; a reader without it sees the member and a plain "read only" line.
- The overview loads on open and shows no member. A member is read only after a reason is given;
  every read is therefore an audit row.
- The reason is required (8 to 500, trimmed) before the confirm button works; abandoning the
  confirm step clears it. A revoke is offered only on a live grant.
- Every database refusal (reason invalid, grant period invalid, account not found, grant already
  revoked, recent auth, MFA, permission, idempotency conflict, function not yet applied) has a
  sentence in French and in Arabic. No raw error code is the only thing shown for a known case.
- Prices come from the API's `priceMinor` and `currency`; there is no price in the screen's code.
- Typed contracts live in `src/backend/premium/admin.ts` with tests; a malformed answer is an
  error, not a half-drawn screen. `database.types.ts` is untouched.
- No migration unless an existing function misses something the screen needs.

Visual

- 1280px and 390px, French and Arabic (right to left, logical properties only), light theme and
  dark theme: no horizontal page scroll (measured with `html, body { overflow-x: clip }` in mind,
  by element rectangles, not `scrollWidth`), tap targets at least 44px, focus rings visible.
- Text contrast at least 4.5:1 (3:1 for large text), measured from rasterised sRGB pixels.
- Screenshots (overview, a found member with events, the confirm step) at both widths in both
  languages, plus a contact sheet, kept outside the repository.

Out of scope: checkout, the billing webhook, the member-facing `/plus` page, any change to
prices, settings or the state machine, any database write by an agent.
