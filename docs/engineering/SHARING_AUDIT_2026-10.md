# Sharing audit, October 2026 (roadmap D5: make sharing simple and attributable)

Lane D5 of the Phase D remediation (`docs/briefs/2026-10-15-audit-phase-d-remediation.md`).
Branch `claude/friendly-turing-ry5fcs`, lane worktree. Read-only on every
database; no migration, no push.

The question: do invite and recap links bring people back to the right place
and the right privacy state, does copying always say what really happened, and
do share images carry only photos and crests we are allowed to use?

## Share paths found

| #   | Where                                                                          | Channels                                                    | Link it produces                                                                             |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | News article (`routes/news.$articleId.tsx`)                                    | share sheet, else copy                                      | the article's canonical address (`buildCanonicalArticleUrl`)                                 |
| 2   | Match page (`routes/matches.$matchId.tsx`)                                     | share sheet, else copy                                      | the page address                                                                             |
| 3   | Pronostics journée (`PredictionsShareButton`)                                  | share sheet, WhatsApp, copy                                 | `/pronostics?journee=N` + `utm_source=share&utm_medium=<channel>&utm_campaign=pronostics`    |
| 4   | League invite, Pronostics and Fantasy league pages (`InviteLinkShare`)         | share sheet, WhatsApp, copy                                 | `/pronostics/ligues/rejoindre#code=<code>&game=<game>`                                       |
| 5   | "Créer une ligue et inviter" (`CreateLeagueInvite`, Fantasy hub, Curva people) | share sheet, WhatsApp, copy                                 | same invite link, `game=fantasy`                                                             |
| 6   | Curva "Inviter des amis" (`InviteFriends`)                                     | WhatsApp, share sheet, copy                                 | same invite link                                                                             |
| 7   | Curva card picture (`ShareCardSheet`)                                          | WhatsApp, share sheet (file), copy, download, gallery (app) | the manager's first private league's invite link, else `/jouer`; utm tags sit before the `#` |
| 8   | Fantasy gameweek recap picture (`GameweekRecapCard` + `ShareImageSheet`)       | WhatsApp, share sheet (file), copy, download, gallery       | `/fantasy`, or `/journee/<publicId>[?lang=ar]` once the manager published, + utm             |
| 9   | Public recap link (`RecapPublication`)                                         | copy (address also printed on screen)                       | `/journee/<publicId>[?lang=ar]`                                                              |
| 10  | Pépites edition and player pictures (`PepitesShareSheet`)                      | same as 8                                                   | `/pepites/semaine/N`, `/pepites/joueur/<id>` + utm                                           |
| 11  | Pépites compare (`PepitesComparePage`)                                         | share sheet, else copy                                      | the page address                                                                             |
| 12  | Fantasy list header (`fantasy-lists/ShareButton`)                              | share sheet, else copy                                      | the page address                                                                             |
| 13  | League invite code (`LeagueInviteCode`)                                        | copy the code                                               | the code itself                                                                              |

Not a share, but a clipboard use: the 2FA secret on `profile.security`. Its
field stays on screen and "copied" shows only after success; left as is.

## What works

- **The invite secret stays out of servers and analytics.** The code rides after
  `#` (`invite-link.ts`), which a browser never sends. The landing page reads it
  after mount, stores it, and removes it from the address bar. Measured in
  Chromium at 390 px, FR and AR: no request carried the code, the address after
  load was `/pronostics/ligues/rejoindre`, and the sign-in prompt navigated to
  `/auth/login?next=%2Fpronostics%2Fligues%2Frejoindre`, so the code is not in
  `next`. `authReturnTarget` refuses any `#code=` hash by design (existing tests),
  and analytics page views drop `#…` and every query key but `utm_*`
  (`src/lib/analytics.ts` header). No `track(...)` call takes the link or code.
- **The invite survives sign-up.** It is kept on the device for 24 hours
  (`INVITE_RECOVERY_MS`), so an e-mail confirmation that opens a new tab still
  finds it. Nothing joins by itself: the recipient taps "Rejoindre".
- **No league is revealed before joining.** The landing page never shows the
  league name; a link preview shows only a generic title.
- **A signed-in non-member** lands on the same page with the join button
  (Pronostics) or the Fantasy join form with the code already in its field
  (`game=fantasy`).
- **Public recap privacy.** `/journee/<publicId>` is read through the narrow
  public projection (alias, gameweek, total, captain line, transfer cost), is
  `noindex` and `no-store`, and a revoked or switched-off link answers one
  neutral message.
- **Photo rights in Pépites pictures.** `sharePhotoUrl` returns a photo only for
  `scope === "in_app_and_social"`, the same test as the server function
  `player_photo_for(…, 'share')` (`20260926070000_player_photo_releases.sql`);
  everything else is a club disc with initials. Covered by
  `share-image.test.ts`. The Fantasy recap picture draws no photo and no crest,
  only the wordmark.
- **Copy and share on the Pépites sheet, the Fantasy recap sheet and the Curva
  card sheet** already reported a failed copy with a toast (not a false "copied").

## Defects found, and what was done

Each fix is small and local; each has a regression test that fails on the old
code (checked by reverting the source change and running the new tests: 17
failures before, 0 after).

| ID   | Defect (evidence)                                                                                                                                                                                                                                                                                                                                    | Fix                                                                                                                                                                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01 | The league code "Copier" button called `navigator.clipboard?.writeText(code)` without waiting and always toasted "Copié" (`LeagueInviteCode.tsx`). With no clipboard (in-app browser, plain http) or a denied one, it said "Copié" and nothing was copied. A false success.                                                                          | Waits for the result; "Copié" only on success, else "La copie a échoué. Sélectionnez le code pour le copier." The code is on screen, selectable.                                                                                                                    |
| S-02 | News and match share: when the person closed the share sheet (`AbortError`) the code fell through to the clipboard and showed "Lien copié", copying a link nobody asked for. A real clipboard failure was swallowed (`/* ignore */`): a silent no-op.                                                                                                | `shareLink()` (new): a closed sheet is `cancelled` and copies nothing; any other failure falls back to copying; a failed copy shows a toast. Measured: sheet closed gives no copy, no toast, no pill; denied clipboard gives the toast.                             |
| S-03 | Wrong failure messages: Pronostics copy failure said "Hors connexion · nouvel essai automatique" (nothing retries a clipboard); the Fantasy list share said "Connexion indisponible. Réessayez pour enregistrer."; the Fantasy invites said "Une erreur est survenue." The invite link was nowhere else on screen, so the person had no way forward. | Failure uses the truthful `pepites.share.copy_failed` ("Le lien n'a pas pu être copié."). Where the link is not on screen (invites, journée share, picture sheets) `ManualCopyField` shows the text in a read-only, pre-selected field with a one-line explanation. |
| S-04 | Copy used only the Clipboard API. Where it is missing or refused, the old `execCommand("copy")` route, which in-app browsers still honour, was never tried.                                                                                                                                                                                          | `copyText()` (new) tries the Clipboard API, then a selected text area, and answers true only when something was copied.                                                                                                                                             |
| S-05 | A native share that fails for a reason other than cancelling (blocked permission, in-app browser) was swallowed as "Declined, not failed" in the invite sheets, the journée share, the Pépites/recap sheet and the Curva card sheet: a silent no-op.                                                                                                 | Cancel stays silent; other failures fall back to copy (invites) or say "L'image n'a pas pu être partagée" (image sheets) / show the text to copy (journée share).                                                                                                   |
| S-06 | `inviteMessage` filled `{name}` with `String.replace` and a string replacement, so a league name is read as a pattern: "Mo$$ Squad" went out as "Mo$ Squad"; "A$&B" re-inserted the placeholder; a league called "{link}" took the link's place and left the real `{link}` empty. Same on the Pronostics share text and the "Invitation prête" line. | `fillInvite()` fills all placeholders in one pass with a function replacer; used by the three invite surfaces.                                                                                                                                                      |
| S-07 | When the browser refused to store the invite (private mode, blocked site data, some in-app browsers), the address bar was cleaned anyway and the code was lost. Measured in Chromium with `setItem` throwing: after the sign-in prompt and Back, the old code showed "Ce lien d'invitation est incomplet".                                           | A copy is kept in memory only when storing failed, with the same 24-hour limit; cleared on join/refusal. After the fix the same run still shows the invite. A sign-in that reloads the page (e-mail link, Google, Apple) still loses it; see "Not fixed".           |
| S-08 | Match, Pépites compare and Fantasy list shares copied `window.location.href`: the sharer's own `utm_*` tags (how they arrived) and any `#fragment` went to the next person, crediting later visits to the first share.                                                                                                                               | `shareablePageUrl()` (new) drops `#…` and `utm_*`, keeps a query that selects what is shown. Used by the three.                                                                                                                                                     |
| S-09 | Once a recap is public, the shared picture still showed the real team name while the link showed the alias the manager chose to display ("Pseudo affiché"), defeating the alias.                                                                                                                                                                     | The picture shows the alias while the recap is public (`RecapPublication` hands up `{publicId, alias}`); redrawn when the alias changes.                                                                                                                            |

The i18n gate stays at its baselines (W1 10, W2 10, W3 244, W4 68).

### New strings (Arabic needs a native read)

| Key                               | French                                                     | Arabic                                 |
| --------------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| `pepites.share.copy_manual`       | La copie automatique a échoué. Copiez le texte ci-dessous. | تعذّر النسخ تلقائيًا. انسخ النص أدناه. |
| `pepites.share.copy_manual_label` | Texte à copier                                             | النص المراد نسخه                       |
| `fpl.copy_failed`                 | La copie a échoué. Sélectionnez le code pour le copier.    | تعذّر النسخ. حدّد الرمز لنسخه.         |

The `pepites.share.*` prefix is kept because it already holds the shared
sheet's words ("Copier le lien", "Le lien n'a pas pu être copié.").

### Measured at 390 px (Chromium, own dev server, mock data)

Clipboard denied and `execCommand` refused (or no Clipboard API at all), no
`navigator.share`, Pronostics journée sheet:

| Language | Field box (x, width x height) | Sentence                                                   | Sheet elements past the viewport | Buttons                        |
| -------- | ----------------------------- | ---------------------------------------------------------- | -------------------------------- | ------------------------------ |
| FR       | 16 to 374, 358 x 44           | La copie automatique a échoué. Copiez le texte ci-dessous. | none (viewport 390)              | close 44, WhatsApp 44, copy 48 |
| AR       | 16 to 374, 358 x 44           | تعذّر النسخ تلقائيًا. انسخ النص أدناه.                     | none                             | close 44, واتساب 44, نسخ 48    |

The field is read-only, focused and fully selected, and its text starts with the
real message and link. When only the old selection route works, the toast says
"Lien copié" / "تم نسخ الرابط" and no field appears. The match-page share button
is 44 x 44. Overflow was measured from element bounds, not `scrollWidth`.

## Rights of images (D5-d)

- Pépites pictures: photos only with a social-use release (above). No crest.
- Fantasy recap picture: wordmark only.
- **Curva card picture: draws the club's crest** (a light plate on the tab and
  beside the name) when the crest loads with CORS. Source: owner request
  2026-10-10 (`docs/engineering/tasks/manager-card-club-crest/screen-brief.md`,
  code comment in `card-share-image.ts`, "supersedes plan 2.6's no crest").
  `PRODUCT.md` (Image and content rights) still says crests are cleared for
  in-app display only, that it is **unknown** whether they may appear in share
  images, and that "today's share images use club discs and initials". Those
  two statements disagree with the code. **Owner decision needed**: either
  confirm the SportsMonks terms cover share images (then update `PRODUCT.md`
  and `docs/product/MANAGER_CARD_SECTION_PLAN.md` line 168), or switch the
  card picture back to the initials disc (a one-line change in
  `ShareCardSheet`/`useCardCrest`). Not changed here: an owner request stands
  until the owner says otherwise.
- No player photo is drawn anywhere else, and none was added.

## Observations not changed

- **The Curva card message carries the manager's first private league's
  invite link** (with its secret code) whenever they have one; the sheet shows
  the league's name but prints the link without the code (`visibleLink`).
  Whoever receives the picture can join that league. If the picture is posted
  publicly rather than sent to a friend, the league's code goes with it. A small
  choice ("Inclure l'invitation à ma ligue") or choosing which league would
  fix it; it changes product behaviour, so it is described, not built. The
  owner can reset a code from the league page.
- **Arabic recipients.** Links carry no language (the language plan in
  `LANGUAGE_URLS.md` is not built). A recipient sees their stored language, or
  the first-visit language choice (seen on `/pronostics` at 390 px); an Arabic
  invite message can open a French page on a fresh device. `?lang=ar` on a
  public recap only changes the server-rendered title and preview.
- Share links use `window.location.origin`, so a share made from a preview or
  staging deployment points at that deployment. Production is the live site.
- Image downloads use a blob `download` link, hidden in the phone app. In-app
  browsers of other apps may not honour it; the share sheet and WhatsApp remain.
- The invite code is long-lived and reusable until the owner resets it. The
  link is a bearer secret in a chat; this is by design (`invite-link.ts`).

## Larger changes (described, not built)

1. A per-recipient or expiring invite (the code is a reusable secret today).
2. A language segment in share links (needs the `LANGUAGE_URLS.md` work).
3. An explicit league picker / opt-in on the Curva card share.
4. A shared sheet component for every share (one place for the manual-copy
   field, tags and events); today six surfaces share the helpers but each keeps
   its own layout.

## Not verified

- A real phone, WhatsApp opening with the message, the iOS Safari share sheet,
  Android share targets, the Capacitor shell's native share and gallery save.
- The e-mail confirmation round trip in a new tab and the Google/Apple return,
  with a real account (the browser runs used the mock backend and went as far as
  the sign-in page and back). Existing `auth-return` and `invite-link` tests pass.
- Whether a browser's `execCommand("copy")` works inside a particular in-app
  browser; the browser runs faked both routes.
- Server-side privacy of `/pronostics/ligues/<id>` for non-members and the
  `get_public_gameweek_recap` projection (no database read here). The client
  and the migration text were read, not executed.
- The Arabic strings by a native reader.
- Image rendering with the new alias on a device (the code path is pinned by a
  source test; the picture itself was not redrawn in a browser).

## Tests

New: `src/lib/copy-text.test.ts` (clipboard, selection fallback, closed share
sheet, tags), `src/components/common/share-fallbacks.test.tsx` (no direct
clipboard calls, manual field on every invite and picture sheet, page shares,
alias on the picture, Arabic strings), plus additions to
`league-invite.test.ts`, `invite-link.test.ts` and `InviteLinkShare.test.tsx`.
