# BG-0012 — Agent D3 completion report (Account / Profile / Auth / Legal / Help)

Branch: `agent/d3-account-profile-auth`, based on `agent/news-cms-launch` @ `668ea3d`
(the frozen News/CMS checkpoint named in the route-ownership map).

## 0. What I found before touching anything

The ownership doc frames these screens as "genuinely unstyled/legacy pages" (zero
`--fpl-*` token hits). That grep is technically true but misleading: `--fpl-*` are
Fantasy-pitch/FDR-specific tokens (pitch greens, difficulty-rating colors), not the
product's general brand tokens. Reading the actual files showed `profile.tsx`,
`AuthShell.tsx` and every `auth.*.tsx` route already consistently use the real
shared design tokens (`--brand-primary`, `--brand-accent`, `--glass-border`,
`--surface`, `--bg-brand-gradient`, `cta-brand`) and are RTL-aware
(`text-start`/`text-end`, `ps-`/`pe-`, direction-aware arrow icons). They were not
"legacy-looking" screens needing a rebuild — they were a reasonably well-built,
already-consistent auth flow. So instead of a wholesale rewrite (which would have
been high-risk churn for no real gain and a bigger conflict surface for the
integrating session), I did a **targeted IA redesign** of Profile plus small
consistency fixes across Auth, and used the budget to close two real, verified
gaps instead of inventing new screens.

## 1. What changed

### `src/routes/profile.tsx`
Restructured the authenticated profile view from three flat, generically-named
groups ("Notifications", "Langue", "Profil") into the Premier-League-app-inspired
IA named in the brief, built on BotolaGO's actual account model:

- **Informations personnelles** (new) — email, `@username`, favorite club as
  explicit rows (`InfoRow`), plus the existing "Modifier le profil" entry point
  into `/auth/profile-setup`. These fields already existed on `AuthUser`; they
  just weren't shown as personal-details rows before (the hero card only showed
  name/username/email inline, and `t("profile.email")`/`t("profile.username")`
  were dictionary keys that no component ever rendered).
- **Préférences** (renamed from "Notifications") — the three existing
  notification toggles plus the language switcher, now under one heading instead
  of two separate groups, matching how the PL app groups "Preferences".
- **Sécurité du compte** (new) — "Changer le mot de passe" (routes to the
  existing `/auth/update-password` screen — no new logic, just a discoverable
  entry point that didn't exist before) and "Se déconnecter" (moved here from a
  standalone button at the bottom).
- **Supprimer le compte** (new, real feature, previously not wired to any UI) —
  see below.

### Delete-account UI — closing a real gap
`AuthService` has shipped `requestAccountDeletion()` / `cancelAccountDeletion()`
on both the Supabase and mock implementations since before this task (they call
`request_account_deletion` / `cancel_account_deletion` RPCs and persist to
`account_deletion_requests` / `my_account_deletion_requests`), but **no route or
component anywhere in the app called them** (verified by grep across
`src/routes` and `src/components` — zero hits before this change). This is
exactly the kind of already-supported-but-unbuilt account feature the brief asks
for, not an invented one.

I added a `DeleteAccountSection` in `profile.tsx` that:
- Shows a destructive "Supprimer mon compte" row.
- Opens a confirmation dialog (reusing the existing `Dialog` primitives, same
  pattern as the pre-existing sign-out dialog) with a plain-language explanation
  and a required "I understand this is irreversible" checkbox that gates the
  destructive button — deliberately not a typed-confirmation-word pattern, to
  avoid a locale-specific exact-string match.
- On confirm, calls `authService.requestAccountDeletion()` (existing method,
  untouched) and flips local UI state to a "Suppression demandée" panel with a
  "Annuler la suppression" action that calls `authService.cancelAccountDeletion()`
  (existing method, untouched).

**Known limitation, called out explicitly:** `AuthService` has no method to
*read back* whether a deletion is already pending (only `requestDeletion` /
`cancelDeletion`; the repository's `listDeletionRequests` exists at the backend
layer but is not exposed through the `AuthService` interface). Wiring a real
"is my deletion pending" indicator that survives a reload would mean adding a
new method to `auth-types.ts` / `auth-supabase.ts` / `auth-mock.ts`, which are
service/logic files outside my owned scope and outside "restyle only, don't
touch auth semantics." I left that as a follow-up rather than fabricating a
client-only flag or touching those files. The pending/cancel toggle in the UI is
correct for the current session; it does not persist across a reload.

### `src/components/auth/AuthShell.tsx`
Extracted the `GoogleGlyph`/`AppleGlyph` SVG icons (previously private to
`auth.login.tsx`) into this shared file and exported them, purely to fix a
visual inconsistency: `auth.register.tsx`'s social buttons rendered plain text
labels ("Google" / "Apple") with no icon while `auth.login.tsx`'s rendered the
brand glyphs. Both screens now render the same icon + label. No behavioral
change — `onSocial("google"|"apple")` handlers are untouched.

### `src/routes/auth.login.tsx`, `src/routes/auth.register.tsx`
Login: now imports the glyphs from `AuthShell` instead of defining them locally
(no visual change). Register: social buttons now use `GoogleGlyph`/`AppleGlyph`
+ `t("auth.google")`/`t("auth.apple")` (both keys already existed and were
already used by login) instead of bare `<span>Google</span>` /
`<span>Apple</span>`. Purely presentational; the click handlers, validation and
submit logic are byte-for-byte unchanged.

### `src/i18n/dictionaries.ts`
Added FR + AR pairs for every new string introduced above (section headings,
change-password description, delete-account copy, confirmation dialog, pending
state, toasts). No existing key was renamed or removed. Every new key is real,
distinct copy in both languages (not a placeholder), satisfying the i18n
gate's W1 ("identical fr/ar") and W2 ("no Arabic script") checks.

### `scripts/qa/i18n-gate.ts`
The gate's `W3` baseline (dictionary keys never referenced from source) moved
`245 -> 244`: adding the "Informations personnelles" section made
`t("profile.email")` a real, literal call site for the first time, taking one
previously-dead key off the unreferenced list. Updated `BASELINES.W3` to `244`
with an inline comment explaining the move, per the test file's own instruction
("a human edits BASELINES below... state in the commit message why the count
moved").

## 2. Legal / Help content — investigation finding

Per the brief, I searched the whole app (routes, footers, modals, static
strings, dictionaries) for any existing Terms/Privacy/About/FAQ content before
doing anything in that area:

- `grep` across `src` for terms-of-service / privacy-policy / mentions-légales /
  FAQ / about-us copy (FR and AR) returns **no dedicated content** — only two
  generic, non-substantive mentions: `auth.terms_notice`
  ("En continuant, vous acceptez nos Conditions et Politique de
  confidentialité.") and `auth.register.accept_terms`, both of which are
  boilerplate consent labels next to the register checkbox, not actual terms.
- There is no footer component anywhere (`src/components/shell` has no footer),
  no `/about`, `/terms`, `/privacy`, `/legal`, `/faq`, or `/help` route, and no
  static legal copy embedded in any modal.

**Finding: REFERENCE ONLY / UNSUPPORTED.** There is genuinely no legal or help
content in this codebase to reorganize. I did not create About/Terms/
Privacy/FAQ routes and did not write any placeholder legal text — doing so
would risk looking like real terms without being reviewed by BotolaGO's owner
or counsel. This is a content gap, not a design gap, and needs real copy
supplied by the business before any such route is built. The two consent
strings above still correctly point at "our Conditions and Privacy Policy" as
a forward reference for whenever that content exists; I left their wording
alone since changing it is a copy/legal decision, not a layout one.

## 3. Auth/security behavior — explicitly verified unchanged

I read every file in scope before touching it and only edited JSX/markup,
icons, class names, and dictionary strings. Specifically verified untouched:

- `src/services/auth.ts`, `auth-types.ts`, `auth-supabase.ts`, `auth-mock.ts`,
  `src/backend/identity/*`, `src/auth/AuthProvider.tsx` — **zero diffs**, all
  `git diff` output confirms no changes were made to these files.
- Every `authService.*` call site I touched or added
  (`requestAccountDeletion`, `cancelAccountDeletion`) calls the **existing**
  method with its existing signature and existing return shape; I did not add
  parameters, change what "delete" does, or bypass its confirmation semantics.
- Sign-in, sign-up, password-reset-request, password-update, OTP-verify, and
  the Supabase callback token-exchange logic in `auth.callback.tsx` are
  byte-for-byte unchanged (I read that file to confirm the flow but made no
  edits to it at all).
- The password-strength meter, validators (`validateEmail`, `validatePassword`,
  `validateUsername`, `passwordStrength`) and their call sites are unchanged.
- `supabase/*` was never opened.

## 4. Validation results

Run from `/home/user/botolago-foundation/.claude/worktrees/agent-a2349b3fce1c127f8`:

- `bun run typecheck` → clean (`tsc --noEmit`, no output/errors).
- `bun test` → **834 pass / 0 fail** (12,628 expectations), including the full
  `src/i18n/i18n-gate.test.ts` suite (21/21) after the `W3` baseline update, and
  `src/services/auth.test.ts` / `auth-selector.test.ts` /
  `production-authority.test.ts` / `src/lib/auth-callback.test.ts` unchanged and
  green.
- `npx eslint` scoped to every file I touched
  (`src/routes/profile.tsx`, `auth.login.tsx`, `auth.register.tsx`,
  `src/components/auth/AuthShell.tsx`, `src/i18n/dictionaries.ts`,
  `scripts/qa/i18n-gate.ts`) → clean (one prettier formatting issue was
  auto-fixed, re-ran clean afterwards).
- `bun run build` → succeeds (`✓ built in 800ms`, Nitro/Cloudflare output
  generated normally, `profile-*.mjs` and `auth-*.mjs` chunks present in the
  server bundle).

No route-level component tests exist anywhere in this repo (`bun test` is
pure logic/unit testing — no `@testing-library` dependency, no jsdom render
harness), so I did not introduce a new test pattern nor did I add DOM-render
tests for the new dialog. All new logic in `DeleteAccountSection` is thin glue
around already-tested `authService` methods; I did not add a new pure/testable
helper function that would warrant its own `bun test` unit test.

## 5. Explicitly out of scope / not touched

- `src/routes/admin.*`, `src/backend/news/*`, `supabase/*`,
  `src/routes/index.tsx`, `src/routes/__root.tsx`, `src/routes/matches.*`,
  `src/routes/fantasy.*`, `src/routes/news*`, `src/components/shell/*`,
  `src/components/common/*` — none opened for editing (only consumed
  `ClubCrest`/`Trans`/`LanguageSwitcher`/`AppShell` as-is, per the map).
- No About/Terms/Privacy/FAQ/Help routes created (see §2).
- No "sign out of all devices" (`signOut({ scope: "global" })`) surfaced in
  Account Security, even though the type already supports it — did not want to
  add a new user-facing security action beyond what the brief asked for
  without an explicit product decision on its copy/behavior.
- No persisted ("survives reload") pending-deletion indicator — see the
  limitation noted in §1.
- `src/services/auth*.ts`, `src/backend/identity/*`, `src/auth/AuthProvider.tsx`
  — read only, never edited.

## 6. Commits

- Committed to the local branch `agent/d3-account-profile-auth` only. Not
  pushed, no PR opened, per instructions — ready for the orchestrating session
  to integrate.
