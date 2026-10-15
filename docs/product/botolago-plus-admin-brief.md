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

---

# Reorganisation (lane 3 of the BotolaGO+ plan, branch `claude/plus-admin-organize`)

Owner-approved 2026-10-14 ("organize it"). Scope: the admin only. Evidence: the four-part audit
(admin/staff part C) with screenshots at 390 and 1280, French and Arabic. Nothing here changes who
may do what: the database still checks permission, MFA, recent authentication and the audit on every
call; no access check is loosened, no migration, no new RPC.

## What must be preserved

- Every permission, MFA, recent-auth and audit behaviour: `premium.read` to open, `premium.grant`
  to grant or revoke, the in-page two-press confirm step, the reason (8 to 500) on each audited
  read and each action, idempotency keys. The nav entry is still a link, never an authority.
- The shell's look (white bar, round chips, kit cards), French/Arabic pairs next to the component,
  logical properties only, `AdminDatum` for LTR data.
- The public rule: the product name is never typed, only the logo. Staff-only labels may draw the
  logo next to the word « Abonnements ».
- `src/components/plus/*`, `src/components/curva/*` and the dictionaries are not touched (other lanes).

## Changes

1. Nav: grouped (Équipe, Contenu, Communauté, Abonnements, Football) with an icon per entry, and
   « Abonnements » (with the logo) placed right after « Utilisateurs ». Group and icon live in the
   contract list; the shell only draws them.
2. Admin home: the module cards are built from that same list, as links, per group, filtered on the
   caller's permissions (the four static, unclickable cards go). An « Abonnements » card shows the
   mode and the subscriber count, read through the existing premium admin overview (no new RPC);
   if the read fails the card is still a link, without figures.
3. `/admin/plus`: a banner at the top by mode (off / preview / on). Counts first, then the member
   lookup, then formulas and settings (the lookup was 1,500px down).
4. « Mon compte »: one press fills the lookup with the signed-in user's own id. The lookup reason is
   reused to prefill the grant reason (still editable, still required).
5. Grant: « jusqu'au {date} » shown before confirming; neutral panel instead of rose; after a grant
   a notice « where to look » with links to /profile and /curva/carte (and a warning when the mode
   is off).
6. Recent-sign-in refusal: a « Se reconnecter » button that returns to /admin/plus.
7. Plain-language errors with no migration numbers; « Interrupteurs » becomes « Réglages »; product
   codes are not shown (an unknown product reads « Autre formule »).
8. A dev-only admin shell sample (`/dev/admin-shell-sample`, not found outside a dev server) that
   draws the real nav, home and the plus page on sample data, so it can be reviewed without a database.

## Acceptance criteria

Functional
- Nav order and grouping as above; « Abonnements » is adjacent to « Utilisateurs »; every entry has
  a group and an icon (unit test); entries still filtered on permission.
- Every home card is a link to its route; no card without a link; the Abonnements card shows mode
  and count, and degrades to a plain link when the overview fails.
- The mode banner reads off / preview / on and is absent while loading or on error.
- « Mon compte » fills the signed-in id; the grant reason starts as the lookup reason; the confirm
  prompt contains the end date; the post-grant notice has both links.
- `recent_auth_required` shows « Se reconnecter » (to /auth/login, next=/admin/plus).
- No string shown to staff contains a migration number or a product code (unit test).
- The typed brand name appears nowhere in the sources (existing test, extended).
- `bun test` for src/backend/admin, src/components/admin, src/routes, src/lib; typecheck; lint.

Visual
- Shell sample and plus sample at 390 and 1280, French and Arabic (right to left): grant, revoke,
  banners for off/preview/on, error state, refusal. No horizontal overflow measured by element
  rectangles, tap targets at least 44px, the grant panel neutral (not rose).
- Before/after screenshots kept outside the repository.
