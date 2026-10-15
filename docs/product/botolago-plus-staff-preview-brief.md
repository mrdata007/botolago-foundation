# BotolaGO+ staff-only preview: brief

Owner decision, 2026-10-14. Written before the change, per AGENTS.md "Screen work".
No visual redesign, no database change, no migration.

## Goal

Staff see BotolaGO+ in the live app; the public sees nothing. The database mode
decides (`docs/backend/PREMIUM_OPERATIONS_RUNBOOK.md`, "The switch"): in `preview`,
`api.get_my_premium()` answers `{ available: true }` to members only (a complimentary
grant from /admin/plus, or a test purchase) and `{ available: false }` to everyone
else; `api.premium_status()` stays `enabled: false` until mode `on`.

## What must be preserved

- Every BotolaGO+ screen, as built: no layout, copy, colour or motion change.
- Mode `on`: members see the sections, other signed-in readers see the locks and the
  offer, prices come from `premium_status`. Behaviour identical to today.
- Modes `off` and `preview` for the public: nothing at all. No blurred teaser, no lock
  chip, no header mark, no Profil section, no offer.
- A production database that does not have the migrations yet answers like `off`
  (PGRST202), with no error UI.
- Checkout, cancel and restore stay « bientôt ». Fantasy, scoring and every other
  business rule are untouched.

## What changes

1. `PREMIUM_BUILD = true`; its comment records the decision.
2. `useLivePremium` also asks `get_my_premium` for a signed-in reader whose status is
   not enabled (once the status has answered), so a preview member is discovered.
3. `derivePremium`: a "preview member" (status not enabled, answer `available: true`
   with a member state, signed in) counts as enabled and member, for that reader only.
   Prices stay empty and checkout stays closed. Pure and unit-tested.
4. The membership probe is silent for readers it does not concern: `{available:false}`,
   a missing function (PGRST202), PT401, and `PT403 mfa_required` all read as off. The
   probe does not report the step-up refusal, so it never raises the notice or takes a
   reader to the code challenge.
5. Surfaces draw nothing until the feature is known to show for this reader: the offer
   (`PlusOffer`) renders null until ready and enabled (a visitor to /plus or /curva/plus
   no longer sees a frame before being sent away); the Profil section renders nothing
   (no skeleton) until enabled.
6. `usePremium` reads the auth state with `useOptionalAuth`, so chrome that renders
   without a provider (the header, server-rendered tests) does not throw.

## Acceptance criteria

Functional:

- Mode `off`: nobody sees BotolaGO+, including a granted staff member.
- Mode `preview`: a granted member sees the member surfaces (header mark, Profil
  section, Curva extras clear, member offer note); a signed-in non-member and a
  signed-out visitor see nothing and get no `locked` state.
- Mode `on`: unchanged.
- RPCs missing or erroring: reads as `off`, no error UI, no MFA prompt, no toast.
- /plus and /curva/plus show nothing and leave for a reader the feature does not show for.
- A preview member's paywall without server prices falls back to the launch prices
  (`priceOf`); nothing breaks and nothing can be bought.

Tests (bun): the decision for every mode (off, preview, on) by reader (signed out,
non-member, member) and RPC missing/error; repository mapping of `{available:false}`,
PGRST202, PT401, PT403 (silent) and other errors; `PREMIUM_BUILD` true in the gate test.
Also `bun run typecheck`, `bun run lint`, full `bun test`.

Visual: none expected (no stylesheet or component markup change).
