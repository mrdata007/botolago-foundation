# BotolaGO+ delivery plan

**Status:** delivery plan for the owner, 2026-10-13. It turns `BOTOLAGO_PLUS_PLAN.md` (the what)
and `botolago-plus-sketch.html` (the look) into the work that makes BotolaGO+ function: who builds
each part, in which order, what each part waits on, and how it reaches botolago.com.

The orchestrator (the Claude session that owns this plan) splits the work into lanes, gives each
lane to its own agent (Sonnet 5.5) in its own git worktree and branch from a clean `origin/main`,
reviews every result against the sketch and the rules, and opens the pull requests. Nothing is
merged, published in Lovable, applied to a database or deployed without the owner saying so for
that item (`AGENTS.md`, Screen work rule 7; `CLAUDE.md`, Production database writes).

## 1. Decisions already taken (owner, 2026-10-12/13)

| Topic | Decision |
| --- | --- |
| Where it lives | In Curva. No tab of its own. Managed in Profil › BotolaGO+. |
| Card | Collector shield for everyone, free. Metal follows the earned tier (graphite, silver, gold, red-gold, cyan holo, purple prism). No photo: the name is a holographic autograph. |
| Paid editions | Holo, Électrique, Pixels, Chrome. Shown publicly (rankings, leagues, profile, share image). Ranking order is points only. |
| Prices | 20 MAD a month, 200 MAD a year (12 months from purchase, no automatic renewal; 40 MAD saving shown against 12 monthly payments). |
| Paywall | The four-screen flow of the sketch; screen 3 in the plan-card + benefits layout. Benefits: Sans publicité, Les éditions de ta carte, Ta carrière en détail, Duels détaillés. |
| Ads | The app has no ads today. « Sans publicité » is a promise: members will never see ads. |
| Logo | BotolaGO+ is always the logo with the 3D « + », never typed on screen. |
| Renewal reminder | J-3 reminder before each monthly renewal. |
| Wording | No "just for fun", no prize mention, no AI-authorship notice on public content. |

## 1b. Owner answers (2026-10-13)

- G1 security clean-up: **not finished yet**, so nothing is merged until the owner says it is done.
- G3 web payment provider: **not decided yet**; lane F waits.
- G4 app stores: **RevenueCat**.
- Lanes **B, D and I start now** (no database writes, nothing merged).

## 2. What must be true before money is taken

These are the conditions that, if unmet, stop the launch. They do not stop the building.

| # | Gate | Why it blocks | Owner action |
| --- | --- | --- | --- |
| G1 | **Security clean-up finished** | An outside GitHub account force-pushed malware to many branches. Until its access is removed, force pushes are blocked on `main`, passwords/2FA/tokens are rotated and Supabase/Lovable secrets are changed, anything merged could be tampered with. | Finish the clean-up steps already given and say "done". Nothing is merged before this. |
| G2 | **Company registered** (RC, ICE, IF) | A payment provider contract and invoices need a registered company (`BOTOLAGO_PLUS_PLAN.md` L11). | Confirm the company's status. |
| G3 | **Web payment provider chosen** | Checkout cannot be built for real without one. Options: CMI through the company's bank, or a licensed provider reselling it (Payzone or similar). The open question is whether it supports automatic monthly card payments; if not, monthly is sold as a month that does not renew by itself, with the J-3 reminder. | Pick the provider, open the merchant account, share test credentials through Supabase function secrets (never in chat). |
| G4 | **App stores** | Inside the iPhone and Android apps, Apple and Google require their own in-app purchase for digital extras, with their commission. Choice: a subscription service (RevenueCat or similar) or our own store verification. | Choose; create the products (20 MAD/month, 200 MAD/year) in App Store Connect and Play Console at the nearest allowed price points. |
| G5 | **Lawyer and accountant** | Consumer law (31-08), TVA, CNDP (09-08) and the terms (`BOTOLAGO_PLUS_PLAN.md` section 6, L2–L9). | Engage them; they review « Conditions de BotolaGO+ » and the privacy update. |

## 3. Lanes

Each lane is one agent, one branch, one pull request (or a short series). Lanes that write
migration files never touch a database; every database write is an owner-run guarded script
(`CLAUDE.md`). Only one lane may own `supabase/migrations/` at a time (one writer per database).

| Lane | Branch | Builds | Waits on | Can start |
| --- | --- | --- | --- | --- |
| **A. Shield card** | `claude/curva-shield-card` | New card renderer for everyone (tier metals, holographic autograph), replaces Éclat through the one-line switch; tokens, share image, moments, tests. | — | **Running now** |
| **B. Membership backend** | `claude/plus-backend-foundation` | Tables and functions of `BOTOLAGO_PLUS_PLAN.md` 5.3–5.4: settings (off), products (20/200 MAD), entitlements and state machine, `has_premium`, `premium_status`, `get_my_premium`, card editions catalogue and `choose_card_design`, card reads gain the edition, grants; pgTAP; guarded apply scripts; operations runbook; `AGENTS.md` writers entry. Files only. | — | **Now** |
| **C. Premium reads** | `claude/plus-premium-reads` | Career detail and detailed duel reads (`get_my_card_career`, `get_card_duel`), privacy switch for history; pgTAP. | B merged (shares migrations) | After B |
| **D. Paywall and screens** | `claude/plus-screens` | Built from the sketch behind `PREMIUM_BUILD = false`: the four-screen offer (style picker, season and rivalry, paywall in the plan-card layout, welcome), `/plus`, Profil › BotolaGO+ (plan, renewal date, cancel, restore, receipts), entry points in Curva (lock chips on extras), J-3 reminder banner. FR/AR, RTL, reduced motion, 390/1280 screenshots. Uses mocked data until B/C land. | Brief committed first | **Now** (UI only) |
| **E. Card editions** | `claude/plus-card-editions` | The four paid editions on the shield renderer (frames, foils, signature inks, motion), their still miniatures in rankings and leagues, the edition picker. | A merged | After A |
| **F. Web checkout** | `claude/plus-web-checkout` | Provider integration, `billing-webhook` Edge Function (signature check, idempotent events), checkout start, receipts/invoices, cancel, expiry tick (pg_cron, switch-gated), J-3 reminder push. End-to-end in the provider's test mode on staging. | B, G2, G3 | After B + provider |
| **G. App stores** | `claude/plus-store-billing` | StoreKit / Play Billing in the Capacitor shell (or the subscription service SDK), `billing-restore`, web checkout hidden in store builds, store notifications into the same webhook. | B, F, G4 | After F |
| **H. Admin** | `claude/plus-admin` | `/admin/plus`: counts by state, member lookup (audited), event timeline, grants and revokes under dual control. | B | After B |
| **I. Legal texts** | `claude/plus-legal` | Draft « Conditions de BotolaGO+ », privacy-policy additions (payment data, processors, retention), Terms section 11 update, store disclosures. Marked draft until the lawyer approves. | — | **Now** (drafts) |
| **J. Release QA** | — (orchestrator) | Full pass before each switch: e2e on staging, FR/AR, mobile/desktop, accessibility, the three launch steps below. | All | At the end |

## 4. Order and merges

```
now      A (card) ─────────────► PR ─► owner OK ─► merge ─► Publish in Lovable
now      B (backend files) ─────► PR ─► CI database-quality ─► owner OK ─► merge
                                     └► owner runs guarded apply: staging, then production (switch off)
now      D (screens, flag off) ──► PR ─► owner OK ─► merge (invisible: PREMIUM_BUILD = false)
now      I (legal drafts) ───────► PR (draft) ─► lawyer
after A  E (editions) ───────────► PR ─► owner OK ─► merge (members only, flag off)
after B  C (reads), H (admin) ───► PR ─► owner OK ─► merge ─► owner-run apply
after B+G2+G3  F (web checkout) ─► provider test mode on staging ─► PR ─► owner OK ─► merge
after F+G4     G (stores) ───────► store review
```

- Every PR: CI green on its head, reviewed by the orchestrator against the sketch and this plan,
  then a draft PR for the owner. The owner says "merge #N"; the orchestrator merges and, when the
  owner says so, runs Publish in Lovable. Migrations are applied only by the owner's guarded script.
- No lane merges before G1 is done.

## 5. Launch in three steps

1. **Preview:** `premium_settings.mode = 'preview'`, `PREMIUM_BUILD = true`; only the owner and
   staff, with grants. Everything visible to them, checkout in test mode.
2. **Invited group:** a small list of fans with complimentary memberships; real devices, FR and AR;
   fix what they find.
3. **Open:** `mode = 'on'`, `checkout_enabled = true` on the web; stores after their review.

Each step is the owner's switch, run by the owner (`premium_configure`), with the pause command in
the runbook.

## 6. How the orchestrator works

- Before each lane starts: check what else is running (other agents, workflows, scheduled jobs in
  `AGENTS.md`) and that the lane's files do not overlap another live lane.
- Each agent gets: its lane from this plan, the sketch, the rules it must follow, and the checks it
  must run (lint, typecheck, unit, pgTAP where Docker allows, build, screenshots). It reports what
  it actually ran.
- The orchestrator re-runs the checks, looks at the screenshots, sends a lane back with notes until
  it passes, then opens the PR and watches its CI.
- Status lives in this file's table (section 3) and in the PRs.

## 7. What the owner is asked now

1. **G1:** is the GitHub security clean-up finished?
2. **G2/G3:** company registration status, and which payment provider (CMI through which bank, or
   Payzone/another).
3. **G4:** subscription service (RevenueCat or similar) for the app stores, or our own?
4. **Approve lanes B, D and I to start now** (no database writes, nothing merged).
