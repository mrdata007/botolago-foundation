# Manager Card onboarding plan

Le premier 84 / «أوّل 84». Written 2026-10-08 by the design director (Claude). This is
the plan the three concepts and two judges were for: Reveal ("Le premier 84") is the spine,
with the parts the judges named grafted from Signing and Build, and every fatal flaw they
found fixed or turned into a stated risk (Appendix A lists each one and where it is handled).

**Status.** Research and design only. This is not approved screen work (AGENTS.md "Screen
work", rule 1). No app file, database or branch was changed to write it. It is shaped as an
Impeccable brief (`reference/shape.md` Phase 3, `reference/onboard.md`). No human answered a
discovery round, so assumptions are marked **Assumption**. **The owner approved all nine
decisions in section 9 on 2026-10-08 ("yes to all")** and asked for the lab screens in
section 7 to be built; `ONBOARDING.md` is that build's brief.

**Provenance tags used throughout**

- **[code]**: checked by reading `origin/main` at `3f9c57fc` on 2026-10-08 (file and line).
- **[Sorare ID, STATUS]**: an entry in the Sorare onboarding research ([private page](https://claude.ai/artifact/4mvzoMabZp7f2xjKgsTcvv);
  kept outside the repository because it holds Sorare's screenshots), with its tag (VERIFIED, SECONDARY, ASSUMPTION). Entries marked "historical" there are from older
  Sorare eras (2021–2024) and are cited as patterns, not as the current product.
- **[ours]**: our own invention. Nothing in the research proves it; testing does.
- **[verify]**: a claim nobody has confirmed yet. Check it before building on it.
- **D1–D20**: decisions in section 5 of [`BACKEND_HANDOFF.md`](BACKEND_HANDOFF.md).
  **D21** is new (section 9 here, and section 6a of the hand-off). **Lab rule n**: a binding rule in
  `design-lab/manager-cards-claude/DIRECTIONS.md`.

**Sample data.** ALI, 84, PRO, CAP 91, SEL 82, TRF 86, CON 78 are the owner's samples. The
serial example is **BOT #482913**, which D14's recommendation allows (100000–999999, no
leading zero). The lab's `BOT #004821` is not used in this plan because D14 rejects it.
Gameweek numbers (J5, J7…) are illustrations. The minimums 3 and 5 always come from the
server's rules row, never from the client.

---

## Brief at a glance

- **Job and audience.** Moroccan Fantasy managers, mostly young, French or Arabic, on a phone.
  They come to manage a squad (Operate). The card adds a few Experience moments to that
  work and never takes it over.
- **Outcome and proof.** The aha is the first real number (the 84), explained by the
  manager's own decisions and seen beside friends. It is proved by first-rating reach and
  return, measured from server acknowledgements without following anyone.
- **Direction.** "Le premier 84": the ceremony goes where the card is worth something. The
  card is born quietly with the first saved squad (no number, and exactly when the number
  will arrive). It forms in the open, one finished journée at a time. Then the number lands
  on every surface at once. The object is the signature move; the app's own layout,
  navigation and controls stay as they are.
- **Scope.** v1: inline surfaces only (one line in the guest intro, one line on the save step,
  a panel on the team page, a hub block, three hints, a hub hero with a detail sheet, a league
  band and head-to-head, share). v2, only if measured: a three-frame story. Not in scope:
  the builder layer, a full-screen interstitial, push or email, XP, badges.
- **States.** The number is null until 3 final results and provisional until 5. TRF can be
  null. Founder, serial and club can be null. Feature off means nothing shows at all.
  Arabic is right-to-left with Western digits.
- **Interaction.** Nothing opens over the screen by itself. At most one expanded hero per
  session. Every moment closes in one tap and is acknowledged on the server, so it is never
  shown twice. Replays live on the card page.
- **Open decisions.** D21 (record seen moments on the server) and eight smaller ones, each
  with a recommendation (section 9).

---

## 1. Job and audience

**Visitor mode: Operate, with Experience moments.** The Fantasy app is a working tool. People
open it to pick a squad, beat a deadline, make a transfer or check a league. The card must
read as part of that product (`reference/mode-operate.md`). The card is the one signature
move. It never supplies the layout, the navigation or the controls. A few moments are allowed
to be Experience moments: the card's birth panel, the first-rating hero, founder, a first tier,
and the optional replay. They are always inline blocks on screens that already exist, never a
takeover.

**Who arrives, in what state**

| #   | Who                                                                           | Where from                                                                                                              | State of mind                                                                                                                 | What they need from the card                                                                                      |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A   | **Guest** (no account)                                                        | `/jouer` or the landing page, a friend's WhatsApp league link, a shared recap                                           | Curious and committed to little. They know FPL or EA FC Ultimate Team ratings. They are building a squad stored on the phone. | One honest line: a card exists, it starts when the squad is saved, and its number is earned. No sample number.    |
| B   | **Signed in, no team this season** (Pronostics player, last season's manager) | Hub, `intro = 'no_team'`                                                                                                | Already trusts the app                                                                                                        | The same line; the call to action stays "Créer mon équipe".                                                       |
| C   | **New manager, just saved**                                                   | The save (`/fantasy/create`) or an import                                                                               | Peak satisfaction about the squad. The card has no number yet.                                                                | Proof the card exists and is theirs, exactly when the number will come, and one social action that is true.       |
| D   | **Manager in the wait** (weeks 1–3)                                           | Returns on journée days. Push and email are off in production, so nothing calls them back [code: `PRODUCT.md:197–207`]. | Mild interest, competing with the real game                                                                                   | A visible count of finished journées, the next deadline, and one sentence when a decision they make feeds a stat. |
| E   | **Existing 2026/27 manager at launch**                                        | Hub, on the day the feature is switched on                                                                              | Already played several rounds                                                                                                 | Their card in its current state, number included if they have one, shown once, without a walkthrough.             |
| F   | **Returning or lapsed manager**                                               | Hub, after weeks away                                                                                                   | Has missed several moments                                                                                                    | One coalesced hero on the current card. Nothing stale is presented as news.                                       |

**Experience levels.** Mixed. FPL veterans understand captain, starting XI and transfers;
EA FC players understand OVR and tiers. The card joins the two: an OVR made of four FPL
decisions. Neither group needs a tutorial. Each stat is named once, at the moment its decision
happens (onboard.md "Context over ceremony").

**Product truths the onboarding must respect** (hand-off §4, PRODUCT.md, lab rules)

- Free to play: no purchase, no stake, nothing that looks like betting or pay-to-win.
- Independent: nothing implies FRMF, LNFP or club affiliation. The object must not look like a
  pass or a Fan ID.
- Data honesty: unknown is a dash, never 0. Provisional is labelled wherever the number appears.
  No invented ratings or counts.
- The server computes everything. The client formats and compares, never scores.
- French and Arabic are equal. Arabic is right-to-left with Western, left-to-right digits.
- Lab rule 5: no ritual holds the number back. Never the words "pull", "pack" or "level up".
- OVR, tier, founder and serial are display-only. No prize, ranking, league or Fantasy rule
  reads them, and no moment changes the game.

---

## 2. The aha moment and how we measure it

**The aha.** After the third final journée, the manager opens BotolaGO and the hub already
shows their card at **84 OVR · PRO · Provisoire**, labelled "Première note · J7". One tap
explains the 84 through their own decisions (captains, starting XI, transfers, regularity).
Their league shows friends' cards beside the usual points, in the usual order. The card stops
being a picture and becomes a measurement of them among people they know. "C'est quoi ta
carte ?" becomes a real question.

**The first value comes earlier, and it is smaller.** In the same session as the first save,
the team page shows a card that is plainly theirs (their name and club colour once the account
has them, the season), with the number slot empty and the exact rounds that will fill it.
**[ours]**

**Time to value, honestly.** The first value is the same session as the save. The aha is
three final journées later, at least two to three weeks, and longer when rounds are published
late. That wait cannot be shortened without inventing a number. The only honest lever is the
owner lowering the minimum in the rules row (D8), never an early fake. Everything in M3 exists
to make the wait visible and useful.

**Measures**

Analytics is the existing cookieless `track()`: a closed union of event names with no
properties, sent to Seline [code: `src/lib/analytics.ts:51–110`]. It cannot follow a person,
so cohort measures come from **aggregate-only server reads the owner grants** (production
reads need his leave, hand-off §2). The acknowledgement table (D21) is what makes the key
measures possible without per-person analytics.

| What                           | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Why                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Aha reach** (primary)        | For each gameweek: managers whose first rating landed there (history rows), and how many of them acknowledged `first_rating` within 7 days of its `calculated_at` (acks). Aggregate only.                                                                                                                                                                                                                                                                                                     | Did people come back and see their number, with no push or email?                                      |
| **Return to the number**       | Of teams created before a given deadline, the share with any card acknowledgement after their first rating. Compared with cohorts from before launch on visits only, read as directional (the calendar confounds it).                                                                                                                                                                                                                                                                         | Did the wait lose them? If drop-off is high, the remedy is the rules row's minimum, not a fake number. |
| **First value**                | `card_born_view` per `fantasy_team_created`, per week. Expect close to 100%. The gap is read failures and refused step-ups.                                                                                                                                                                                                                                                                                                                                                                   | The panel reaches new managers in the same session.                                                    |
| **Social loop** (owner's goal) | `card_share_*` per first rating (Seline count ÷ server count of first ratings that week); `card_born_invite`; league joins from invite links before the next deadline (existing league data, aggregate).                                                                                                                                                                                                                                                                                      | "I'm 86, you're 78."                                                                                   |
| **Comparison coverage**        | Rated managers whose league has at least one other rated member (aggregate); `card_h2h_open`.                                                                                                                                                                                                                                                                                                                                                                                                 | Is there anyone to compare with?                                                                       |
| **Guardrails**                 | (1) Save-step conversion: `signup_submitted` and `fantasy_team_created` per `card_save_line_view`, against the same weeks before launch; if it drops, the save-step line goes. (2) The builder funnel (new names below) does not move. (3) `card_share_preview_homa` share of previews against the server's tier distribution: a low HOMA rate signals shame. (4) Hero closes without the detail. (5) French against Arabic, from an aggregate join of acks on `profiles.preferred_language`. | Do no harm to the squad funnel; watch for shame.                                                       |
| **Correctness**                | A moment cannot be acknowledged twice (primary key). Any `*_view` count above the number of moments pending that week means repeats, which is a bug. Zero card moments while the feature is off.                                                                                                                                                                                                                                                                                              | "Never twice" is measured, not assumed.                                                                |

**New event names** (each a distinct name, because `track()` takes no properties) [ours]:
`card_save_line_view`, `card_born_view`, `card_born_invite`, `card_born_close`,
`card_arrival_view`, `card_block_open`, `card_hint_cap_view`, `card_hint_sel_view`,
`card_hint_trf_view`, `card_first_rating_view`, `card_first_rating_detail`,
`card_first_rating_close`, `card_share_preview_homa|stade|pro|champion|legend` (five names),
`card_share_whatsapp`, `card_share_native`, `card_share_copy`, `card_share_download` (the
recap's `fantasy_recap_share_*` set, mirrored), `card_league_band_view`, `card_h2h_open`,
`card_provisional_cleared_view`, `card_tier_up_view`, `card_founder_view`,
`card_season_closed_view`, `card_season_started_view`, `card_replay_open`. Builder funnel
(Build's idea, as names): `fantasy_build_gk_complete`, `fantasy_build_def_complete`,
`fantasy_build_mid_complete`, `fantasy_build_fwd_complete`, `fantasy_build_name_step`.

**Measurement fix to propose separately.** The import path
(`src/components/fantasy/FantasyImportPrompt.tsx:134`) saves a first team on the server but
fires no `fantasy_team_created` [code], so today the activation count misses imports. Firing
it there changes a reported number, so it is the owner's call (section 9).

**No targets in advance.** There is no baseline (PRODUCT.md records no traffic data). The
first cohort sets it.

**Qualitative.** Five to eight phone sessions with French- and Arabic-speaking Botola fans,
including teenagers and at least two parents (Sorare report Part C gap 9). Questions: does the
empty number slot read as "not yet" or "broken"? Does HOMA as a first tier read as a start or
a verdict? Is a friend's number in the league a pleasure or a shame? Does "Provisoire" /
«مبدئي» make sense? Is a real name on a shareable card acceptable to a parent? Semelle's sole
and sacred-name test belongs in the same sessions. Any use of "signature" / «توقيع» waits for
these sessions; this plan does not use the word.

---

## 3. The moments, in order

Layouts are for a 390 × 844 phone, 16px gutters (358px content), mirrored in Arabic. "Start"
and "end" are inline directions. Every tap target is at least 44px. "Hero" means an existing
inline block, expanded for one moment; it is never a dialog.

**Global gate.** No card surface, line or moment exists unless the public status says
`enabled` (read switch on and an active rules row). For signed-in managers the card read must
also return a card. With the feature off, every screen is exactly as it is today, with no
"coming soon". [ours, on hand-off D19 and the switch rules]

**Journey at a glance**

| #   | Moment                            | Trigger in plain words                                            | Surface                                                                                      | Opens by itself?                               |
| --- | --------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| M1  | `first_contact`                   | Guest, or signed in without a team, while registration is open    | One point in the guest intro; one line on the save step; hints in register and profile setup | No                                             |
| M2  | `card_created`                    | The first card read after a first team exists, until acknowledged | A panel at the top of `/fantasy/team` (or the hub)                                           | No: it sits on the page the save already opens |
| M3  | formation (state)                 | Card exists, number still null                                    | Hub block, rankings token, recap line; three one-time hints                                  | No                                             |
| M4  | `first_rating`                    | The season's first non-null OVR                                   | Hub hero, then a detail sheet; v2 story                                                      | No                                             |
| M5  | league                            | League members rated                                              | League band, rows, head-to-head                                                              | No                                             |
| M6  | share                             | A tap on Partager                                                 | Share sheet and image                                                                        | No                                             |
| M7  | `provisional_cleared`             | First evaluated gameweek with provisional false                   | One line                                                                                     | No                                             |
| M8  | `tier_changed`                    | First time ever at a higher tier; or a fall                       | Hub hero, or a line on the card page                                                         | No                                             |
| M9  | `founder_granted`                 | The owner's grant set the cohort                                  | Hub hero                                                                                     | No                                             |
| M10 | `season_closed`, `season_started` | Season frozen; new season's team saved                            | Hub hero; formation block                                                                    | No                                             |
| M11 | returning and launch              | Several moments pending                                           | One coalesced hero                                                                           | No                                             |
| M12 | replay                            | A tap on Revoir                                                   | Card page                                                                                    | No                                             |

---

### M1 · `first_contact` — the card is named, never shown off

**Trigger (exact).** `fantasyHubLayout(...).intro` is `signed_out` or `no_team`, the guest
intro is in its open state (an enrolment gameweek exists, so it is not the registration-closed
variant) [code: `src/components/fantasy/FantasyGuestIntro.tsx:269–284` holds the closed state],
and `api.manager_card_status()` returns `enabled = true` (proposal, section 6a of `BACKEND_HANDOFF.md`).
Registration closed, or the flag off: nothing is said about the card.

**M1a · Guest intro: a fifth "how it works" point**

- _Purpose:_ first contact. Promise the card as the result of playing, without adding a step or
  competing with "Créer mon équipe".
- _Layout (390px):_ inside the existing "Comment jouer" list [code: `FantasyGuestIntro.tsx:192–215`,
  four points: squad, budget, captain, deadline], after the deadline point, because it is a
  result, not a step. Same row anatomy as the other four. The 36px disc holds the object's
  24–28px mini in its own base material with a dash in the number carrier. It is not a lucide
  icon, and in particular not an ID-card icon (Fan ID risk). Title in body-strong, body in
  secondary. Nothing above the fold moves. The one call to action stays "Créer mon équipe".
- _Actions:_ none of its own. _Next:_ unchanged, `/fantasy/create`.
- _Copy:_
  - FR: title « Votre carte de manager » · body « Elle démarre avec votre équipe. Sa note
    arrive après 3 journées terminées. »
  - AR: title «بطاقتك كمدرّب» · body «تبدأ مع فريقك، ويأتي تقييمها بعد 3 جولات منتهية.»
  - (3 from `min_rated` in the status read. No promise of a club, a number or a serial at this
    stage: any of them may be null.)

**M1b · The save step: one line and an empty token above the button**

- _Trigger:_ `step === 'name'` on `/fantasy/create` [code: `src/routes/fantasy.create.tsx:180, 376`]
  and the status flag on.
- _Purpose:_ raise the value of saving at the exact moment an account is asked for (Sorare
  pattern 9).
- _Layout (390px):_ inside the existing name card, between the captain and vice-captain rows
  and the guest note: one 64px row, a 48px token at start and two short lines at end. The
  "Entrer l'effectif" button [code: `fpl.enter_squad`, `fantasy.create.tsx:470`] stays last and
  full width.
  - Guest: the token is drawn locally, in the object's base material, with the hooded shared
    avatar and a dash. No name, no club, no serial text, and no server read. The name the card
    will carry is chosen at sign-up, so showing the team name here would be wrong after saving.
  - Signed in without a team: the token shows the card name (display name if not blank, else
    team name: D17, the board rule) and the club colour if one resolves (see M1c), with a dash.
- _Fix that ships with it:_ remove `autoFocus` from the team-name input
  [code: `fantasy.create.tsx:420`], so the line and the button are seen before the keyboard
  opens. Measure at 390 × 844 in French and Arabic. (Build's graft. Signing's preview would
  have sat under that keyboard.)
- _Actions:_ none added. _Next:_ unchanged. A guest gets the existing account prompt
  [code: `fantasy.create.tsx:303`, `fantasy.create.sign_in_reason`]; a signed-in manager saves.
- _Copy:_
  - FR: « À l'enregistrement, votre carte de manager démarre avec votre équipe. Sa note arrive
    après 3 journées terminées. »
  - AR: «عند حفظ فريقك تبدأ بطاقتك كمدرّب، ويأتي تقييمها بعد 3 جولات منتهية.»
- _Event:_ `card_save_line_view` (the conversion guardrail).

**M1c · The account path (guest only): name and club said back, then one tap left**

- _Trigger:_ the guest pressed "Entrer l'effectif". `AuthPromptDialog` passes
  `next = pathname` [code: `src/components/auth/AuthPromptDialog.tsx:33`], and register, verify and
  profile setup carry `next` through [code: `auth.register.tsx:140`, `auth.verify.tsx:63`,
  `auth.profile-setup.tsx:57`].
- _Register (`/auth/register`):_ one hint under "Nom complet" [code: `auth.register.full_name`].
  - FR: « Sert de nom affiché sur votre carte et dans les classements. Modifiable à l'étape
    suivante. »
  - AR: «يُستخدم اسمًا معروضًا على بطاقتك وفي الترتيب، ويمكن تغييره في الخطوة التالية.»
  - [verify] that registration writes the full name into `display_name`. Profile setup reads
    `user.displayName` back into its field [code: `auth.profile-setup.tsx:89`], which suggests
    it does.
- _Profile setup, steps 1 and 2 (`/auth/profile-setup`, when `next` is `/fantasy/create`):_
  under the existing "Étape n sur 3" bar, a 64px token at start labelled « Votre carte » /
  «بطاقتك».
  - Step 1: the name on the token follows the "Nom affiché" field as it is typed (Changa 800,
    in whichever script is typed). Hint, FR « Ce nom figure sur votre carte et dans les
    classements. Un prénom ou un surnom suffit. » · AR «يظهر هذا الاسم على بطاقتك وفي الترتيب.
    يكفي اسم أول أو لقب.» (The nickname line answers the parent's question about a real name on
    a shareable card.)
  - Step 2: tapping a club row recolours the token at once (lab rule 8). Hint, FR « Votre club
    donne sa couleur à votre carte. Modifiable dans votre profil. » · AR «يمنح ناديك لونه
    لبطاقتك، ويمكن تغييره من ملفك الشخصي.»
  - **Condition on step 2.** Profile setup saves the club as `favorite_team_provisional_ref`
    through `complete_onboarding` [code: `src/services/auth-supabase.ts:529`,
    `src/backend/identity/supabase-repositories.ts:86–92`]. Nothing in the client writes
    `favorite_team_id`, which is what the card's club reads (hand-off §3.3). Until the card read
    resolves that reference to an `app.teams` row (addendum, "Verify first"), the step-2 hint
    is not shown and the token keeps its own material. No copy anywhere promises a club colour
    before that works.
  - Skipping the club leaves the object in its own material (lab rule 15). Step 3 is unchanged.
- _Back in the builder:_ when the restored draft is complete and valid, `/fantasy/create` opens
  on the name step (today it opens on the pitch: `useState<"squad" | "name">("squad")`
  [code: `fantasy.create.tsx:180`]) with focus on the save button and one line above it.
  - FR: « Compte créé. Il reste à enregistrer votre équipe. »
  - AR: «تمّ إنشاء حسابك. بقي حفظ فريقك.»
  - [verify] which of the create route's draft restore and `FantasyImportPrompt` a returning
    guest meets. M2's trigger is data-driven, so either path works for the card.

**Borrowed.** Pattern 9, ask for the account when there is something to save: LIVE-S06,
LIVE-S07 [VERIFIED], and the missed hand-off in LIVE-S13 [VERIFIED]. Name said back: LIVE-S07
[VERIFIED], TP-07 [SECONDARY, historical 2021: preset badges, "you can change these later"].
The club shapes what follows: OFF-S03, OFF-S06 [VERIFIED], TP-14 [SECONDARY, historical].
Teach a few nouns and keep money out of the first steps: TP-35 [SECONDARY, historical]. One
welcome object: W03 [VERIFIED]. Defer what is not needed yet: A04, A05 [VERIFIED].

**Departs.** Sorare's first viewport leads with a purchase offer and cash and asks for a manager
name before anything (LIVE-S01, LIVE-S02, LIVE-S06 [VERIFIED]). BotolaGO keeps its squad-first
order and promises identity, not winnings. Sorare's favourite team decides which players you are
given (OFF-S03); here the club decides only a colour, players are bought with the 100.0 budget
and the 3-per-club rule is untouched. Sorare's welcome object is a sealed pack (W03, T01
[VERIFIED], TP-27 [SECONDARY]); here it is the user's own object, empty where data is empty.

**Ours.** The fifth intro point, the guest token without a name, the live token in profile
setup, and reopening on the name step.

---

### M2 · `card_created` — the first squad saved: the card is born, with no rating yet

**Trigger (exact, data-driven).**

1. The status flag is on.
2. `api.get_my_manager_card()` returns a card for the current fantasy season. It answers in the
   `forming` state for any manager with a current-season team even before the card tick has
   created the row, with `serial = null` until assigned (addendum).
3. The moment `card_created` is pending (not acknowledged).
4. The manager is on `/fantasy/team` or the Fantasy hub, whichever comes first.

Because the trigger reads data, it covers every way a first team appears: the save, the import,
and teams that existed before launch. No client event has to be caught.

**Client hooks (never on the critical path).** In the `res.ok` branch of `save()`
[code: `fantasy.create.tsx:342–352`], and in the import's success branch
[code: `FantasyImportPrompt.tsx:134–138`, which fires no event and does not navigate],
**invalidate** the card query so the next screen reads fresh data. Never await it, never add a
tap, never change the destination: `pendingInvite()?.game === 'fantasy'` still goes to
`/fantasy/leagues/join`, otherwise `/fantasy/team` [code: `fantasy.create.tsx:349–352`]. Coming
from an invite, the panel waits for the first visit to the team page or the hub.

**Variants, chosen by data**

| Data                                | Wording                                                                                     | Who                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `gameweeks_counted = 0`, `ovr` null | "New"                                                                                       | C: just saved                                    |
| `gameweeks_counted ≥ 1`, `ovr` null | "Arrival, forming"                                                                          | E: existing manager at launch, below the minimum |
| `ovr` not null                      | Not M2. M4's arrival wording, which acknowledges `card_created` and `first_rating` together | E: existing manager, already rated               |

**Screen M2 · Panel at the top of the team page**

- _Purpose:_ end the first squad on something finished and owned: the saved squad below, the
  card in its starting state above, exactly when the number arrives, and one social action that
  is true.
- _Layout (390px), about 300px tall, an inline card above the saved pitch (never a dialog):_
  - Top row, 44px: the heading « Votre carte de manager » (body-strong, 17px) at start; a
    labelled × (44px target) at end.
  - Body, two columns. At start, the full card at 128px wide (height from the object's own
    aspect, about 180px). It is the biggest element in the panel. At end, two or three short
    lines (below). The marks for counted rounds are drawn empty on the object (0 of 3).
  - Bottom: the invite line, then one full-width 48px **soft** button « Inviter des amis »
    (soft, not gradient, so it does not compete with the team page's own primary action).
  - The pitch starts right under the panel, so its top row stays visible at 844px.
- _The object:_ name in Changa 800 (lab rule 11) once the account has one; club colour if
  resolved (lab rule 8), else its own material (rule 15); season carrier 2026/27; ID carrier
  with a dash while the serial is null (data honesty: a dash, no sentence, no moment when it
  arrives); number carrier with a dash. Tier null means base material and no tier word
  (section 9, decision 4).
- _Motion:_ the app's existing enter-rise, 300ms or less. The object may "make" its belonging
  parts within 700ms (Écharpe knits its cast-on, Porte-clés engraves the name, Lucarne chalks the
  goal, Touchline fills its person leaf). No flip, no confetti, no sound. Static under reduced
  motion. Nothing animates the dash or the serial.
- _Copy, "new":_
  - Heading: FR « Votre carte de manager » · AR «بطاقتك كمدرّب» (never the name in a heading)
  - Line 1: FR « Sa note arrive après 3 journées terminées : J5, J6, J7. » · AR «يأتي تقييمها
    بعد 3 جولات منتهية: الجولات 5 و6 و7.» When the server cannot list all three (rounds not yet
    published): FR « Sa note arrive après 3 journées terminées, à partir de la J5. » · AR «يأتي
    تقييمها بعد 3 جولات منتهية، ابتداءً من الجولة 5.»
  - Line 2: FR « Elle mesurera vos choix : capitaine, titulaires, transferts, régularité. » ·
    AR «ستقيس قراراتك: القائد، والتشكيلة، والانتقالات، والثبات.»
  - Serial line, **only when the serial is not null**: FR « Son numéro, BOT #482913, ne
    changera jamais. » · AR «رقمها BOT #482913 لن يتغيّر أبدًا.»
  - Invite line, **only while the first counted round's deadline is ahead**: FR « Invitez vos
    amis avant la date limite de la J5 : leurs journées compteront en même temps que les
    vôtres. » · AR «إذا انضمّ أصدقاؤك قبل الموعد النهائي للجولة 5، تُحتسب جولاتهم مع جولاتك.»
    (Hedged on purpose. It promises counting, which is always true for teams enrolled before the
    same deadline. It does not promise a number, which may stay null for a friend.)
  - Button: FR « Inviter des amis » · AR «دعوة الأصدقاء». Close: « Fermer » · «إغلاق».
- _Copy, "arrival, forming":_ FR « Nouveau : votre carte est calculée à partir de votre équipe.
  Sa note arrive après 3 journées terminées (2/3). » · AR «جديد: تُحسب بطاقتك انطلاقًا من
  فريقك. يأتي تقييمها بعد 3 جولات منتهية (2/3).»
- _Actions:_ « Inviter des amis » opens the existing league create-and-invite flow
  [code: `fantasy.hub.create_invite`, `fantasy.hub.invite_message`], WhatsApp first. The ×, the
  button, or two seconds with the panel at least half on screen acknowledge `card_created`.
- _Next:_ the team page as today. The hub block shows M3.
- _Events:_ `card_born_view`, `card_born_invite`, `card_born_close`, `card_arrival_view`.

**Borrowed.** An explicit finish line with the invite at peak satisfaction: TP-33 [SECONDARY,
historical 2021]. The first squad as the activation milestone: C01 [VERIFIED], C02 [VERIFIED;
the reading is ASSUMPTION]. One welcome object: W03 [VERIFIED]. Name the round the squad enters
and never dead-end on timing: T02 [VERIFIED], TP-13 [SECONDARY], REV-GP-STARTER [SECONDARY],
OFF-S07 [VERIFIED, corrected: announced, not shipped]. A welcome addressed to the manager:
GP-DESC-FR [VERIFIED].

**Departs.** No pack, no random contents, no flip-to-reveal (W03, TP-27, P03 [VERIFIED]). No
credit widget waiting on arrival (TP-34 [SECONDARY]). The invite earns nothing (C01, C02, A06
[VERIFIED] pay per referral milestone). No interstitial and no extra tap: Signing's
`/fantasy/signature` full-screen and Reveal's 88% sheet are both cut.

**Ours.** The panel on the team page, the data-driven trigger, the hedged same-deadline line.

---

### M3 · Formation — the waiting period: card in formation, rounds counter

**Trigger.** The card exists, `ovr` is null, and `gameweeks_counted < min_rated`. This is a
state, not a moment: no acknowledgement. It changes when the server counts a new **final**
round (stable means `status in ('finalized','corrected')` and `points_state = 'final'`, hand-off
§3.3). Lineups copy forward, so a passive team is counted too (D12).

**M3a · Hub card block**

- _Layout (390px):_ in the owner's hub area (`FantasyHubPersonal`, directly under the team
  summary Valeur · Banque · Rang) [code: `src/components/fantasy/FantasyHubPersonal.tsx:61`], a
  card-width block of about 120px. At start, the 64px token (lab rule 7: the 44–80px token
  belongs in the manager's own block) with a dash in the number carrier and the round marks
  filled to the count. At end, by size: the counter « 1/3 » (display figure, the biggest thing
  in the block), the label, then one line with the next round and its deadline (from the hub's
  existing deadline data). The whole block taps through to the card page. It has no button,
  because the useful action is playing the round.
- _Copy:_
  - Label: FR « Carte en formation » · AR «البطاقة قيد التكوين»
  - Line: FR « Note après 3 journées terminées · prochaine : J6 · date limite sam. 16:30 » ·
    AR «التقييم بعد 3 جولات منتهية · التالية: الجولة 6 · الموعد النهائي السبت 16:30»
  - Before the first counted round is final: FR « Première journée comptée : J5. » · AR «أول
    جولة محتسبة: الجولة 5.»
- _Accessible name of the token:_ « Carte de manager, pas encore de note, 1 journée comptée sur
  3 » · «بطاقة المدرّب، لا تقييم بعد، جولة واحدة محتسبة من 3». Never "0".

**M3b · Sub-states of the same block**

| Sub-state                       | Trigger                                                                                                                  | FR                                                                        | AR                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Eve                             | `gameweeks_counted = min_rated − 1` and the next counted round is locked or live (existing gameweek status)              | « Dernière journée avant votre note : J7. »                               | «آخر جولة قبل تقييمك: الجولة 7.»                                    |
| Over, not final                 | That round's matches are done but it is `provisional`, `finalizing`, or postwork for its current version is not complete | « J7 terminée, pas encore définitive. La note arrive dès qu'elle l'est. » | «انتهت الجولة 7 ولم تُعتمد نهائيًا بعد. يظهر التقييم فور اعتمادها.» |
| Minimum reached, OVR still null | `gameweeks_counted ≥ min_rated`, `ovr_null_reason = too_few_stats` (fewer than three stats, D1)                          | « 3 journées comptées. La note attend encore une statistique. »           | «احتُسبت 3 جولات. ينتظر التقييم إحصاءً آخر.»                        |
| Late signer                     | The season is closed with `gameweeks_counted < min_rated`                                                                | « Saison terminée avant votre première note : elle viendra en 2027/28. »  | «انتهى الموسم قبل تقييمك الأول: يأتي في موسم 2027/28.»              |

No time is ever promised: finalisation time varies and corrections run for 72 hours
(FANTASY_RULES_V1.md, via Reveal).

**M3c · Rankings "my position" card.** In `MyRankCard` [code: `src/components/fantasy/MyRankCard.tsx`],
the 44px token with a dash and « 1/3 » in its secondary line. Tap: the card page.

**M3d · The private recap.** One line under the total on "Ma journée BotolaGO"
[code: `src/components/fantasy/GameweekRecapCard.tsx`]: FR « Journée comptée pour votre carte :
2/3 » · AR «جولة محتسبة لبطاقتك: 2/3».

**M3e · Three one-line stat hints, at the decision itself** (Signing's graft)

- _Trigger:_ the card exists and `ovr` is null; each hint once, on the first matching action
  after the card exists. Hints are stored per device (`botolago.card.hint.cap.v1`, `.sel.v1`,
  `.trf.v1`; blocked storage counts as seen, the PrizeWelcome rule). They are low-stakes
  teaching lines, not moments, so they do not use server acknowledgements; a hint may show once
  more on a second phone.
- _Layout:_ an inline info alert (`UiAlert tone="info"`), dismissible, directly above the control
  being used. It never covers a control and never blocks the deadline flow.
- _Where and copy:_
  - Captain action in `PlayerActionSheet` [code: `src/components/fpl/PlayerActionSheet.tsx:144`,
    `fpl.make_captain`]: FR « Votre capitaine compte pour CAP sur votre carte. » · AR «اختيار
    القائد يُحتسب في خانة «القائد» على بطاقتك.»
  - First substitution on `/fantasy/team`: FR « Votre onze de départ compte pour SEL. » · AR
    «التشكيلة الأساسية تُحتسب في خانة «التشكيلة».»
  - First visit to `/fantasy/transfers`, above the list header: FR « Vos transferts comptent pour
    TRF. Sans transfert, TRF reste vide (—). » · AR «الانتقالات تُحتسب في خانة «الانتقالات». من
    دون انتقالات تبقى فارغة (—).»
- _Events:_ `card_hint_cap_view`, `card_hint_sel_view`, `card_hint_trf_view`.

**M3f · First transfer line** (Build's graft). On the existing transfer confirmation, while
TRF's null reason is `no_transfers`: FR « TRF mesurera ce transfert après 3 journées
terminées. » · AR «يُقاس هذا الانتقال في خانة «الانتقالات» بعد 3 جولات منتهية.» (Here 3 is the
TRF window from the rules row, D4, not `min_rated`.)

**M3g · Later, after PR #376 merges** (Build's graft, single lines only). PR #376 (explicit
captain step, bench strip) is open and not mergeable as of 2026-10-08 (`mergeable_state:
dirty`) [code: GitHub API]. Once it merges and the card is on:

- At 15/15 in the builder: FR « SEL mesurera le choix de vos titulaires. » · AR «ستقيس خانة
  «التشكيلة» اختيار الأساسيين.»
- At #376's captain choice: FR « CAP mesurera vos choix de capitaine, journée après journée. » ·
  AR «ستقيس خانة «القائد» اختيارات القائد، جولةً بعد جولة.»
- No card parts, no line-to-part metaphor, no hint row, no crest strip in the builder.

**M3h · Later, after D2, D3 and D5 are answered: one weekly fact.** One muted line under the
counter, from the server's per-round ingredients (addendum, "Later"). FR « CAP · votre
capitaine : 6 pts, le meilleur de votre XI : 11 pts » · AR «القائد · قائدك: 6، أفضل لاعب في
تشكيلتك: 11». If that round's ingredient is excluded, the server's reason code says why
(« SEL ne compte pas les semaines Bench Boost. » · «لا تُحتسب جولات تعزيز الاحتياط في خانة
«التشكيلة».»), otherwise the line is omitted, never invented. Until then the block shows only
the counter and the next round. (Judge 1 would defer the facts; judge 2 calls them the only real
value of the wait. Both are respected: they ship as soon as the formulas exist, keyed to the
rules version.)

**Borrowed.** A clear waiting state that stays editable: TP-19 [SECONDARY]. The current step
with the next target in sight: G01, AS-US-04 [VERIFIED], TP-28 [SECONDARY]. n/N counters:
TP-26 [SECONDARY, historical], W04 [VERIFIED], G03 [VERIFIED]. Progress at the centre, next
fixture beside it: TP-09 [SECONDARY]. One rule at the moment it is used: LIVE-S13 [VERIFIED],
TP-24, TP-16, REV-AS-EXPLAIN [SECONDARY]. Explain by a real example: I02 [VERIFIED, corrected],
TP-12 [SECONDARY, historical].

**Departs.** Marks are never lost: no lives, no reset to step 1 (F01, G01 [VERIFIED]). No reward
on any mark (AS-US-04's cash nodes). No daily missions or claims (G03, TP-29). « terminées »,
not « jouées », because only final results count.

**Ours.** The recap line, the eve and not-final wording, the first-transfer line, device-local
hints.

---

### M4 · `first_rating` — the 84, after the third final gameweek, provisional until five

**Trigger (exact).** The card read lists the pending moment `first_rating:<fantasy_season_id>`.
The server derives it from the season's first history row with a non-null OVR (addendum). The
trigger is a non-null OVR, not "3 counted", because OVR can stay null at 3/3 (D1). **The number
appears on every surface (hub block, rankings token, league rows, card page) as soon as the read
returns it, whether or not the hero is ever seen.**

**Wording, chosen by data** [ours]

| Data                                                                                     | Hero label (FR · AR)                                                                                 | Line (FR · AR)                                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Fresh: `first_rated_gameweek_seq = through_gameweek_seq` and `card_created` acknowledged | « Première note · J7 » · «أول تقييم · الجولة 7»                                                      | « Provisoire jusqu'à 5 journées terminées. » · «يبقى مبدئيًا حتى 5 جولات منتهية.»              |
| Arrival (launch): `card_created` also pending                                            | « Votre carte de manager est là » · «بطاقتك كمدرّب هنا»                                              | « Calculée sur 7 journées terminées de votre saison. » · «حُسبت من 7 جولات منتهية هذا الموسم.» |
| Coalesced (returning): first rating older than the latest evaluated gameweek             | « Première note : 84 (J3). Aujourd'hui : 81, STADE. » · «أول تقييم: 84 (الجولة 3). اليوم: 81، ملعب.» | as fresh, if still provisional                                                                 |

The arrival and coalesced forms acknowledge every key they fold in (`card_created`,
`first_rating`, `provisional_cleared` if pending). If `provisional` is already false, the chip
and the line are absent and M7 never fires. A season-scoped moment from an earlier season is
never returned by the server, so a stale first rating is never news.

**M4a · Hub hero (the M3 block, expanded once)**

- _Purpose:_ show the number. Everything else is optional.
- _Layout (390px), about 280px:_
  - Top row: the label at start, a 44px × at end.
  - Middle: the card at 132px wide at start. At end: **84 OVR** at display size (Changa 800,
    OVR inline as a unit, lab rule 6), the tier word under it, and the « Provisoire » chip
    (text, never colour alone).
  - One line.
  - Bottom: two 48px buttons, « Voir le détail » (primary, start) and « Partager » (end).
- _Motion:_ the 84 is legible in the first painted frame. The object may play one beat of
  600ms or less over the visible number (section 7, per direction). No count-up from 0, no
  flip, cover, blur, scratch or tap-to-reveal. Nothing under reduced motion.
- _Actions:_ « Voir le détail » opens M4b; « Partager » opens M6; ×, either button, or two
  seconds at least half on screen acknowledge.
- _Copy, buttons:_ FR « Voir le détail » · « Partager » · AR «عرض التفاصيل» · «مشاركة»
- _Events:_ `card_first_rating_view`, `card_first_rating_detail`, `card_first_rating_close`.

**M4b · Detail sheet: where 84 comes from** (Signing's tiles)

- _Layout:_ a bottom sheet at about 85% height, with a drag handle and a 44px close. The card at
  200px wide, centred, with the number visible. Heading, one line, then a 2 × 2 grid of stat
  tiles (the app's `UiStatBlock`, 64px rows): long label and value, or a dash with its reason.
  A footer line. Sticky buttons in the thumb zone. A small « Revoir » text button by the card
  replays the object's beat, number visible throughout; hidden under reduced motion. It fits
  844px without scrolling; shorter phones scroll the tiles under the sticky buttons.
- _Copy:_
  - Heading: FR « Votre première note : 84 OVR » · AR «تقييمك الأول: 84»
  - Line: FR « Provisoire jusqu'à 5 journées terminées. Elle vient de vos décisions : » · AR
    «مبدئي حتى 5 جولات منتهية، وهو نابع من قراراتك:»
  - Tiles: « CAP · Vos capitaines » 91 · «القائد · قرارات القائد» 91; « SEL · Votre onze de
    départ » 82 · «التشكيلة · اختيار التشكيلة» 82; « TRF · Vos transferts » 86 · «الانتقالات ·
    قرارات الانتقالات» 86, or « — · pas encore de transfert » · «— · لا انتقالات بعد»; « CON ·
    Votre régularité » 78 · «الثبات · الثبات» 78. (Arabic long labels are the kit's strings,
    lab rule 12. CON's Arabic long label equals its code in the kit; the tile then shows it
    once.)
  - Footer, only if D1 is the equal-weight mean: FR « La note est la moyenne des statistiques
    disponibles. » · AR «التقييم هو متوسط الإحصاءات المتوفرة.»
  - Tier distance, only if D9 uses fixed thresholds: FR « CHAMPION à partir de {from}. » · AR
    «فئة بطل ابتداءً من {from}.»
  - One-sentence formula per tile (Reveal's frame 2 rows) only after D2–D5 are answered, keyed
    to the rules version.
  - Buttons: FR « Partager ma carte » · « Voir ma ligue » · « Revoir » · AR «مشاركة بطاقتي» ·
    «عرض الدوري» · «إعادة العرض»

**M4c · v2, only if measured: a three-frame story.** The `PepitesReveal` shell
[code: `src/components/pepites/PepitesReveal.tsx`]: segmented progress with an aria-label
"n sur 3", a back pill, a time stamp, replace navigation so Back leaves. Frame 1 the number,
frame 2 the tiles (M4b), frame 3 the league (M5 rows). Share is on every frame. It ships only if
`card_first_rating_detail` ÷ `card_first_rating_view` shows people want more than the hero (the
owner sets the threshold after the first cohort). Reveal's four frames are cut to three.

**Borrowed.** A personal goal independent of rank, « peu importe ton classement »: GP-DESC-FR
[VERIFIED]. Admit uncertainty (grey "?" for weak data): P02 [VERIFIED]. Explain with the user's
real data: I02 [VERIFIED, corrected]. Share at peak satisfaction: TP-33 [SECONDARY, historical].
Distance to the next group as a non-monetary cue: GP-US-04 [VERIFIED]. Segmented progress for
the v2 story: W04 [VERIFIED], TP-26 [SECONDARY]. One big number, used only because it is defined
and true: AS-US-06 [VERIFIED].

**Departs.** Sorare's first-run payoffs are packs opened to see what you got (TP-27 [SECONDARY],
W03 [VERIFIED], AS-WHATSNEW "Open packs" [VERIFIED]) and levels that end in cash or Essence (G01,
AS-US-04 [VERIFIED]). Here the only "reward" is the number and its reasons, shown at once. The
copy never says « révélation », because nothing is hidden.

**Ours.** The data-chosen wording (fresh, arrival, coalesced), the hero-then-sheet split, the
measured gate on the story.

---

### M5 · League: friends rated, and the head-to-head

**Trigger.** On a private league page [code: `src/routes/fantasy.leagues.$leagueId.tsx`], the
planned batch card read (up to 100 Fantasy team ids, hand-off Phase 4, signed-in only, D19)
returns members' cards. The band shows when at least one member's `first_rated_gameweek_seq`
equals the latest evaluated gameweek. It is a weekly state, not acknowledged.

**M5a · Band and rows**

- _Layout:_ one line above the table, with up to three minis of newly rated members. Table rows
  in the **league's own points order** (never re-sorted by OVR: OVR is display-only and no
  ranking may read it). Each row has the 24–28px mini inside the name cell (lab rule 7) and, in
  its secondary line, the OVR with « Provisoire », or « en formation 2/3 ». The manager's own row
  is highlighted and scrolled into view.
- _Copy:_ band, names only so that no low number becomes a headline (judge 2's fix): FR
  « Nouvelles notes après la J4 : Karim, Salma » · AR «تقييمات جديدة بعد الجولة 4: كريم، سلمى».
  Row secondary: FR « en formation 2/3 » · AR «قيد التكوين 2/3».
- _Compare hint, once per device:_ FR « Touchez un manager pour comparer vos cartes. » · AR
  «للمقارنة بين البطاقتين، يكفي لمس اسم مدرّب.»

**M5b · Head-to-head sheet** (from any row)

- _Layout:_ a bottom sheet. Two cards side by side at about 160px each (the manager's own at
  start), names under them. Four rows « CAP 91 · 85 »: the higher value in heavier weight with a
  small bar, never colour alone. « Provisoire » under either card when it applies. A dash for any
  null value, never 0. A close button at the bottom. **No share button:** a friend's rating is for
  signed-in readers only (D19) and does not leave the app in an image.
- _Copy:_ FR « Vous 84 · Karim 78 » · « Fermer » · AR «أنت 84 · كريم 78» · «إغلاق»
- _Event:_ `card_league_band_view`, `card_h2h_open`.

**Borrowed.** Rows grouped with the distance to the next group: GP-US-04 [VERIFIED]. Invite
always within reach: G02 [VERIFIED]. An invite that names the inviter: TP-03 [SECONDARY,
historical], here inside the WhatsApp message. Comparison among people at the same stage: C04
[VERIFIED, historical 2024], here only presentational.

**Departs.** No payout banner or prize framing (GP-US-04's « +135,50€ »). No global OVR
leaderboard, no ranking by OVR. No reward per invite (C01, C02, A06).

**Ours.** Names-only band, no-share head-to-head.

---

### M6 · Share — my card, to WhatsApp

**Trigger.** A tap on « Partager » (M4, M8, M9, M10, the card page). Never automatic.

- _Layout:_ the existing `ShareImageSheet` [code: `src/components/common/ShareImageSheet.tsx`],
  story aspect: preview at about 60% width, WhatsApp first and full width, then « Partager
  l'image » and « Copier le lien », and a download when the phone cannot share a file.
- _Image (1080 × 1920), drawn on the phone like the recap image_ [code:
  `src/components/fantasy/recap-image.ts`]: the card large, the name, the number with its tier,
  `BOT #482913` (only when not null), the season, « Note provisoire · J7 » / «تقييم مبدئي ·
  الجولة 7» when provisional (small, present), the club as a colour disc with initials (crests in
  share images are undecided), the unmodified wordmark (lab rule 9), botolago.com. Only the
  sharer's own card. Drawn in the interface language; Arabic fully right-to-left. No
  « officiel », no league logo, no serial denominator.
- _Message_ (« tu » is allowed in a message the manager sends [code: `PRODUCT.md:318`]; numbers isolated
  with U+2068…U+2069, as `ShareImageSheet` already requires):
  - With a league: FR « Ma carte BotolaGO : 84 (provisoire). Et toi ? Rejoins ma ligue
    « {ligue} » : {lien} » · AR «بطاقتي في BotolaGO: ‏84 (مبدئي). وأنت؟ انضمّ إلى دوريي
    « {league} »: {link}»
  - Without: FR « Ma carte BotolaGO : 84. Et toi ? {lien} » · AR «بطاقتي في BotolaGO: ‏84.
    وأنت؟ {link}» (link: `/jouer` with a campaign tag). The word « provisoire » / «مبدئي» is added
    whenever it applies.
- _Buttons:_ FR « WhatsApp » · « Partager l'image » · « Copier le lien » · AR «واتساب» · «مشاركة
  الصورة» · «نسخ الرابط»
- _Events:_ `card_share_preview_<tier>`, `card_share_whatsapp`, `card_share_native`,
  `card_share_copy`, `card_share_download`.

**Borrowed.** Copy and Share on the completion screen: TP-33 [SECONDARY]. One true big number:
AS-US-06 [VERIFIED]. **Departs.** Sorare's store frames keep English UI in French art (AS-FR-SET
[VERIFIED]) and lead with WIN and cash (AS-US-04, GP-US-04). This image is fully localised,
carries no prize or money, and says « provisoire » when it is. Signing's « Annoncer ma
signature » share of an unrated card is cut: nothing to compare, and it read as a referral
advert.

---

### M7 · `provisional_cleared` — quietly

**Trigger.** The pending moment `provisional_cleared:<fantasy_season_id>`: the first evaluated
gameweek of the season with `provisional = false` (after `min_confirmed` final results).

- _Surface:_ one line in the hub block, once. The chip leaves every surface.
- _Copy:_ FR « Votre note n'est plus provisoire : 85 après 5 journées. » · AR «لم يعد تقييمك
  مبدئيًا: 85 بعد 5 جولات.» Never « confirmée » / «مؤكَّد»: the number still moves every journée.
- _Ack:_ on display. _Event:_ `card_provisional_cleared_view`.
- **Borrowed:** labelled certainty, P02 [VERIFIED]. **Departs:** no reward for passing a
  threshold (G01, C01).

### M8 · `tier_changed` — up is shown, down is stated

**Trigger.** Up to a tier above HOMA that this account has never held: the pending moment
`tier_changed:<tier>`, returned only while the manager still holds that tier or higher. Any other
change (a fall, if D9 allows it, or a return to a tier held before) is not a moment.

- _M8a, up, hub hero (as M4a):_ the card in its new tier at start; at end the tier word at
  display size with the OVR beside it. FR « Votre carte passe PRO. » · « 84 OVR après la J12. Le
  palier suit votre note, journée après journée. » · AR «بطاقتك الآن في فئة محترف.» · «84 بعد
  الجولة 12. تتبع الفئة تقييمك جولةً بعد جولة.» Buttons « Voir ma carte » · « Partager » · «عرض
  بطاقتي» · «مشاركة». Never « monter de niveau » or « level up ».
- _M8b, down or return:_ one line on the card page only, no hero, no motion: FR « Palier actuel :
  STADE. Meilleur cette saison : PRO. » · AR «الفئة الحالية: ملعب. الأفضل هذا الموسم: محترف.» If
  the owner chooses a season-best tier (D9 alternative), only the OVR line changes.
- _Event:_ `card_tier_up_view`.
- **Borrowed:** a level earned by play, G04 [VERIFIED, historical 2023]; tiers grouped with the
  distance shown, GP-US-04. **Departs:** Sorare's ladders pay out and reset (G01, F01) and its
  tabs follow scarcity (G04). Here nothing is won, a tier can fall honestly, and the words say so.

### M9 · `founder_granted` — ·26 after the name

**Trigger.** The card's founder cohort is set (the owner's one-time guarded grant, D13) and
`founder_granted` is pending. Before the grant: nothing, no teaser, no "eligible". A manager never
granted sees nothing, ever, and no "missed it" line.

- _Hub hero (as M4a):_ the card showing **ALI ·26** with the direction's founder part. In Arabic
  the year follows the name in reading order, isolated left-to-right: علي <bdi dir="ltr">·26</bdi>.
- _Copy:_ FR « Fondateur 2026 » · « Votre année s'inscrit après votre nom : ALI ·26. Cette marque
  a été accordée une seule fois et ne le sera plus. » · with a stored cut-off, add « Accordée aux
  équipes 2026/27 créées avant le {date}. » · AR «عضو مؤسس 2026» · «تُكتب سنتك بعد اسمك: علي ·26.
  مُنحت هذه العلامة مرة واحدة ولن تُمنح مجددًا.» · «مُنحت لفرق موسم 2026/27 المُنشأة قبل {date}.»
  The name sits in the body line, never in the heading.
- _Buttons:_ « Voir ma carte » · « Partager » · «عرض بطاقتي» · «مشاركة». _Event:_
  `card_founder_view`.
- **Borrowed:** a non-material mark for taking part (TP-25's lesson, [SECONDARY, historical]); keep
  visible recognition of the past (REV-GP-FR-SET [SECONDARY]). **Departs:** Sorare's prestige is
  bought scarcity shown as serial denominators (AS-US-02 [VERIFIED], I03 [VERIFIED], "5/1000").
  Founder is time-bound, never sold, never upgraded, the same at every tier, and no count of
  founders is ever shown.

### M10 · `season_closed` and `season_started` — new season

- _`season_closed:<fantasy_season_id>`:_ the season row is frozen (D7). Hub hero, once: FR
  « Saison 2026/27 terminée : 86, CHAMPION. Elle reste sur votre carte. » · AR «انتهى موسم
  2026/27: 86، بطل. يبقى على بطاقتك.» The direction's season carrier gains the season (a scarf, a
  season ball charm). _Event:_ `card_season_closed_view`.
- _`season_started:<fantasy_season_id>`:_ the manager has a team in a new season and a frozen
  earlier season; returned only while the new season's OVR is null. The M3 block shows last
  season's number labelled "2026/27" (never a dash, D7) and the new counter beside it: FR « Saison
  2027/28 : votre carte garde sa note 2026/27 jusqu'à votre première note de la saison, après 3
  journées terminées. » · AR «موسم 2027/28: تحتفظ بطاقتك بتقييم 2026/27 حتى أول تقييم لك هذا
  الموسم، بعد 3 جولات منتهية.» _Event:_ `card_season_started_view`. The new season's first rating
  is M4 again (hero and sheet).
- **Borrowed:** the season start as a named re-entry moment, AS-EVENT [VERIFIED]. **Departs:**
  Sorare restarts managers each set and users ask where their cards went (REV-GP-FR-SET
  [SECONDARY]); here nothing resets to zero.

### M11 · Returning users and launch

- **Launch (E).** Before switching reads on, the owner lets the card tick catch up on every
  evaluable gameweek of the season (addendum, runbook rule), so launch-day managers see their real
  state, not a false 0/3. Then: below the minimum, M2's arrival-forming panel; rated, M4's arrival
  hero (acknowledging `card_created`, `first_rating`, and `provisional_cleared` if pending). One
  moment each, not two.
- **Returning after weeks away (F).** One coalesced hero on the current card (M4's coalesced
  wording), acknowledging every key it folds in. Lower moments wait or become their one-line
  states. Season-scoped moments from earlier seasons are never returned.
- **Second device.** Acknowledgements are on the server (D21), so a moment seen on one phone does
  not come back on another.
- **Borrowed:** land on a playable state, never an empty tab (OFF-S07 [VERIFIED, corrected],
  TP-34 [SECONDARY]); do not front-load the first run (A04, A05). **Departs:** no "welcome back"
  offer or credits (LIVE-S20, C06 [VERIFIED]).

### M12 · Card page and replay

- _Where:_ the card page, route proposal `/fantasy/carte`, reached from the hub block, the
  rankings token and the profile. Full card (biggest element), the four stats with long labels,
  values or dashes with reasons, the counter or the rating line with the next deadline, the
  history (OVR per evaluated gameweek, newest first), « Partager », and a « Revoir » / «إعادة
  العرض» list that holds only moments that happened: « La première note · J3 », « Fondateur
  2026 », « Première fois PRO · J12 », « Saison 2026/27 ».
- _Replay:_ replays the moment's hero with **that gameweek's stored values**, stamped with its
  round, and a first line with the current number: FR « À la J3 : 84. Aujourd'hui : 87. » · AR
  «في الجولة 3: 84. اليوم: 87.» It plays only the object's own beat (Lucarne's ball meeting the top
  corner, Écharpe's stripe knitting in), never automatically, with the number visible from the
  first frame. Static under reduced motion.
- _Event:_ `card_replay_open`.
- **Borrowed:** "Play again" at the end of a demo, LIVE-S13 [VERIFIED]. **Departs:** Sorare's demo
  replays with no exit and no completion; this replay ends on the current card and is never the
  only way to see the number.

---

## 4. States and edges

| State                                                                               | What the person sees                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature off** (status `enabled = false`: read switch off, or no active rules row) | Nothing about the card anywhere. No "coming soon". Every screen as today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Guest**                                                                           | M1a and M1b only: one intro point, one save-step line with an unnamed, locally drawn token. No card, no serial, no counter, no sample number, no server read beyond the anonymous status. The draft stays on the phone as today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Signed in without a squad**                                                       | M1a (no-team audience) and M1b with the real card name and, once resolution works, the club colour. No card row: cards are for managers only (D14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Registration closed** (no enrolment gameweek)                                     | No card mention at all, as `FantasyGuestIntro`'s closed state today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Null OVR** (below the minimum)                                                    | A dash in the number carrier, read aloud as « pas encore de note » / «لا تقييم بعد». Never 0. Counter k/3 and the next round. Never a padlock, blur, frost, question mark or sealed object (each reads as a loot box or scratch card): the finished object with an empty carrier, like a new scarf with no rows yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Minimum reached, OVR still null** (fewer than three stats, D1)                    | « 3 journées comptées. La note attend encore une statistique. » with the server's reason code. The first-rating trigger is a non-null OVR, not the count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Provisional**                                                                     | « Provisoire » / «مبدئي» on every surface that shows the number: hub, rankings token, league rows, head-to-head, card page, share image and message.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **TRF null**                                                                        | A dash with its reason: « pas encore de transfert » / «لا انتقالات بعد» when no batch exists (`no_transfers`); « calculé 3 journées après le transfert » / «يُحسب بعد 3 جولات من الانتقال» when a batch's window is not final (`window_open`). OVR comes from the other three (D1). The copy never implies a manager must transfer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Other null stats**                                                                | A dash and the server's reason code (`pending_minimum`, `excluded_weeks_only`, `board_not_final`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Founder pending** (before the owner's grant)                                      | Nothing. No ghost mark, no "bientôt fondateur".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Not a founder**                                                                   | Nothing, ever.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Serial null** (D14/D15 unanswered, or the tick has not run)                       | The ID carrier with a dash; no serial sentence anywhere; no moment when it arrives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Club null** (skipped, or not resolvable)                                          | The object in its own material, no disc (lab rule 15).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Name**                                                                            | Display name if not blank, else team name (D17). Headings never carry the name, so long names and Arabic gender never break a heading. The card fits long names with each direction's own fit ladder, never cut to an initial.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Deadline passed during the build**                                                | The existing enrolment logic moves the squad to the next journée and shows its notice [code: `fantasy.create.tsx:222`, `fantasy.create.enrolment_next`]. M2 names the server's `rating_gameweeks` from that journée. If the server refuses the save because the deadline passed between build and save, the existing error shows and nothing card-related appears.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Late signer / season ends below the minimum**                                     | M3b's late-signer line. Next season shows last season's value with its label if there is one (D7), else a dash.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Round over, not final**                                                           | M3b, no promised time.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Correction after the first rating** (72-hour window)                              | The current number everywhere. The replay shows the stored value for that round with its version. The hero is not shown again.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Cancelled gameweek**                                                              | Not counted; the counter does not move; "prochaine" names the next real round.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Double gameweek**                                                                 | Counted once, as the backend defines (D2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **CAP weeks before PR #376**                                                        | If D12 excludes them, the CAP reason code says so: « J1 non comptée : capitaine attribué par défaut. » / «لا تُحتسب الجولة 1: عُيّن القائد تلقائيًا.»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Deleted account / deletion pending**                                              | The card read returns nothing (D19: no card for a deleted-pending profile), so every block and moment disappears; acknowledgements and the card go with the account; the serial is retired (D15). The deletion request in `src/routes/profile.tsx` [code] gains one line when a card exists: FR « Votre carte de manager et son numéro BOT #482913 seront supprimés. Ce numéro ne sera jamais réattribué. » · AR «ستُحذف بطاقتك كمدرّب ورقمها BOT #482913، ولن يُعاد إسناد هذا الرقم أبدًا.» (serial part only when not null). A new account gets a new number; founder is not restored. [verify] what a cancelled deletion restores (ACCOUNT_DELETION_RUNBOOK.md).                                                                                                                                                                               |
| **A friend deleted**                                                                | Gone from league rows and the head-to-head (the batch read omits deleted-pending profiles). Images already sent cannot be recalled (risk).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **MFA step-up refused** on the card read or the acknowledgement                     | No moment, nothing blocks the flow (`showStepUpNotice` behaves as today) [code: `src/auth/step-up-notice.ts`].                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Offline, or the read fails**                                                      | Hub: nothing new and no card block (never a stale number presented as new). Card page: FR « Impossible de charger votre carte. » · « Réessayer » · AR «تعذّر تحميل البطاقة.» · «إعادة المحاولة». A failed acknowledgement is retried on the next visit; the moment may show once more (acceptable; logged as a repeat).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Storage blocked / private window**                                                | No effect on moments (server acks). Hints count as seen (the PrizeWelcome rule: never nag).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Reduced motion**                                                                  | No enter-rise, no make beat, no number beat, no slide between story frames; « Revoir » beat buttons hidden. Content, order and number identical.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Arabic (RTL)**                                                                    | Full mirror: the token at inline start is on the right, sheets and grids mirror, the v2 story's progress fills from the right, lucide arrows mirrored. Western digits (`Intl.NumberFormat` with `-u-nu-latn`). `BOT #482913`, `84 OVR`, `2026/27`, `1/3`, `·26` and gameweek numbers isolated left-to-right (`<bdi>` in the UI, U+2068…U+2069 in messages). Names in Changa 800 in both scripts (lab rule 11), no letter-spacing on Arabic. Modern Standard Arabic written as Arabic, not translated. Plurals through `Intl.PluralRules('ar')` and the app's one/two/few/other keys: 1 «جولة واحدة», 2 «جولتان», 3–10 «جولات», 11+ «جولة». Labels from the kit: «القائد، التشكيلة، الانتقالات، الثبات»; tiers «حومة، ملعب، محترف، بطل، أسطورة» (pending the owner's choice to translate them); «عضو مؤسس». Rules in section 5, "Copy discipline". |
| **Dark mode**                                                                       | Tokens only; each direction's material sets its colour (lab rule 15); no black with brass (lab rule 3); a rim on the token over dark grounds. Contrast read from rasterised pixels.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Low-end Android**                                                                 | Compact surfaces draw the token only; the full card is drawn only in the M2 panel, M4b, the head-to-head and the card page (Build's performance graft).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Semelle**                                                                         | No onboarding moment ships on Semelle until the sole and sacred-name test passes (CRITIQUE.md): M2 puts the user's own name on a sole at the moment of belonging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

---

## 5. Skip, never twice, replay

**Nothing opens by itself over the screen.** Every card surface is an inline block on a screen
that already exists. The only new sheets (M4b detail, M5b head-to-head, the card page's replay)
open on a tap.

**Every moment is skippable in one tap.** Each hero and panel has a labelled 44px ×. Escape and
the phone's Back close sheets. Nothing in the onboarding is required to keep playing, and skipping
loses nothing, because the number is already on every surface.

**Never shown twice.** Each moment has a key, acknowledged on the server per account (D21,
section 6a of `BACKEND_HANDOFF.md`):

| Key                                                  | Scope             |
| ---------------------------------------------------- | ----------------- |
| `card_created`                                       | account           |
| `first_rating:<fantasy_season_id>`                   | season            |
| `provisional_cleared:<fantasy_season_id>`            | season            |
| `tier_changed:<tier>` (stade, pro, champion, legend) | account, per tier |
| `founder_granted`                                    | account           |
| `season_closed:<fantasy_season_id>`                  | season            |
| `season_started:<fantasy_season_id>`                 | season            |

A moment is acknowledged by its ×, by either of its buttons, or after two seconds at least half
on screen (one full view). A coalesced hero acknowledges every key it folds in, in one call. The
client also caches acknowledged keys on the device (`botolago.card.moments.v1`, PrizeWelcome's
style) so nothing flashes back while the call is in flight.

**Fallback if D21 is declined.** Device-only versioned keys, plus windows: `first_rating` within
14 days of its `calculated_at`, `founder_granted` within 30 days of `founder_granted_at`,
`card_created` within 14 days of the team's creation. Stated cost: a moment may show once more on
a second phone, and the aha-reach measure is lost.

**First-look rules** (Signing's graft, adapted to inline heroes) [ours]

1. At most one expanded hero or M2 panel per app session (session-scoped flag). Priority:
   `card_created` panel > `first_rating` (including arrival and coalesced) > `founder_granted` >
   `tier_changed` > `season_closed` > `season_started` > `provisional_cleared` (a line). Lower
   ones wait for the next session or show as their one-line state.
2. Nothing expands, and no view is counted, before the launch sequence lets go: splash finished,
   dictionary hydrated, language chosen. This is PrizeWelcome's gate
   `ready = splashDone && isHydrated && hasChosen` [code: `src/components/prizes/PrizeWelcome.tsx:53–55`].
3. Card heroes live only on Fantasy screens, so never on match or news routes.
4. Within 60 minutes of a deadline, hub heroes stay collapsed (the block still shows the number);
   the deadline comes first. The M2 panel is exempt: it is the save's own continuation.
5. `PrizeWelcome` (a one-time modal on the hub for owners) [code: `src/routes/fantasy.index.tsx:272`]
   waits for a session in which no card hero or panel showed. Neither shows while
   `FantasyImportPrompt` or the step-up notice is on screen.

**Replay** lives on the card page under « Revoir » / «إعادة العرض» (M12), and as a « Revoir »
text button inside M4b. A replay uses that gameweek's stored values with the current number on
screen, plays only the object's own beat, is never automatic, and is static under reduced motion.
The number is never held back by any ceremony (lab rule 5).

**Copy discipline (acceptance criteria for every string)** [Signing's graft, extended]

- ·26 appears only when founder is granted.
- « n'est plus provisoire » / «لم يعد مبدئيًا», never « confirmée » / «مؤكَّد».
- « terminées » / «منتهية», never « jouées »: only final results count.
- No serial sentence while the serial is null; no placeholder such as « bientôt attribué ».
- No promise of a notification, a time or a date that the server does not hold.
- No name in any heading.
- French says « vous »; « tu » only in share and invite messages the manager sends
  [code: `PRODUCT.md:318`].
- Arabic buttons are verbal nouns (إنشاء فريقي، دعوة الأصدقاء، مشاركة، عرض التفاصيل، إغلاق), and
  statements use neutral or passive forms (تمّ إنشاء حسابك، تُحتسب، يأتي تقييمها). Imperatives
  only in messages the manager sends (as the app's own invite message does: «انضم إلى دوريي»
  [code: `fantasy.hub.invite_message`]).
- Arabic «الجولة n» in card copy. ج{n} only inside existing app strings reused unchanged.
- Provisional uses the app's root (مبدئي / مبدئية, as `fantasy.gameweek.status.provisional` =
  «مبدئية» [code: `src/i18n/dictionary-ar.ts:503`]), agreeing with its noun: «تقييم مبدئي». Never
  «مؤقت».
- Banned in both languages: pull, pack, level up, monter de niveau, débloquer, tirage, chance (for
  the rating or the serial), révélation, officiel / رسمي, signature / توقيع (pending the parents'
  test), and any lucky or special-number wording about the serial.

---

## 6. What we deliberately do not copy from Sorare, and why

From the report's "Patterns to AVOID for BotolaGO" (Part B), plus the parts of our own concepts
the judges cut.

| Sorare pattern                                                                                      | Evidence                                                                                   | Why not here                                                                | What we do instead                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Purchase-linked welcome offers and credit widgets                                                   | LIVE-S01, LIVE-S06, LIVE-S20, C06 [VERIFIED], TP-34 [SECONDARY]                            | Free to play; money in the first steps reads as pay-to-win                  | M2 lands on the saved squad and the card, with nothing to claim                                                         |
| Cash headlines and payout imagery                                                                   | LIVE-S02, W04, AS-US-04, G01, GP-US-04 [VERIFIED], TP-08 [SECONDARY]                       | Real prizes exist but must not be led with as cash, a ladder or a stake     | The number and its reasons are the only result; no prize copy in any card moment                                        |
| Packs and random reveals, even free ones                                                            | LIVE-S02, W03, T01, P03 [VERIFIED], TP-27, TP-29, TP-30 [SECONDARY]                        | Players are bought by budget; nothing may be random or look like a loot box | The card is born empty where data is empty; the number is legible in the first frame; no flip, cover, scratch, count-up |
| Wheels and spins                                                                                    | W04 [VERIFIED], TP-29 [SECONDARY]                                                          | Gambling vocabulary                                                         | None                                                                                                                    |
| Auctions, markets, trading                                                                          | AS-US-05 + GP-US-05 [VERIFIED], TP-31 [SECONDARY]                                          | No market in BotolaGO                                                       | Transfers stay a Fantasy decision, taught by one hint                                                                   |
| Crypto and NFT language                                                                             | AS-US-04, LIVE-S15, I01 [VERIFIED]                                                         | Irrelevant and alienating                                                   | None                                                                                                                    |
| Rarity tiers and "5/1000" serials                                                                   | AS-US-02, AS-US-03, AS-US-05, I03 [VERIFIED]                                               | Signals that money buys status                                              | Tiers earned by play only; the serial is an ID with no denominator, never animated, never "lucky"                       |
| Lives, streak-to-cash ladders, reset to level 1                                                     | LIVE-S11, F01, G01, G02 [VERIFIED]                                                         | No lives or ladder in BotolaGO's rules; reads as gambling                   | Marks are never lost; passive weeks count; a falling tier is a quiet line                                               |
| Daily missions and claims                                                                           | G03 [VERIFIED], TP-29 [SECONDARY]                                                          | Nags; BotolaGO's rhythm is the journée                                      | One counter that moves only with final journées                                                                         |
| Referral rewards per milestone                                                                      | C01, C02, A06 [VERIFIED]                                                                   | Pay-to-recruit                                                              | Invites carry only a true statement (same rounds counted)                                                               |
| Per-set restarts to "Free"                                                                          | REV-GP-FR-SET [SECONDARY]                                                                  | Feels like losing everything                                                | Every season stays on the card; last season shows until the new number exists                                           |
| Name asked before anything; name availability check                                                 | LIVE-S01, LIVE-S06 [VERIFIED]                                                              | Identity before value; BotolaGO is squad-first                              | The name is asked at the account step, after the squad                                                                  |
| Untranslated UI inside localised art; no Arabic                                                     | AS-FR-SET, AS-INFO, A02 [VERIFIED]                                                         | French and Arabic are equal                                                 | Both languages written natively, Arabic fully mirrored                                                                  |
| Unexplained vanity counters                                                                         | LIVE-S02 [VERIFIED]                                                                        | Never invent counts                                                         | No founder count, no "x managers rated"                                                                                 |
| Quality failures (wrong error copy, raw markdown, a demo with no exit, app-to-browser verification) | LIVE-S04, LIVE-S03, LIVE-S13, LIVE-S14 [VERIFIED], REV-AS-AUTH [SECONDARY], A01 [VERIFIED] | Erodes trust                                                                | Acceptance criteria in section 7; replay always ends on the current card                                                |

**Also cut from our own concepts.** Signing's full-screen `/fantasy/signature` interstitial (an
extra tap and up to 1.5s on the activation path) and its share of an unrated card. Reveal's 88%
sheet that opened without a tap, its four-frame story (three frames, v2, measured), and number
headlines in the league band. Build's 104px hint row and 16-crest strip above the pitch, its
line-to-part metaphor (no line ever affects the OVR), its six-row checklist (close to TP-25's
achievement checklist), « Note confirmée », and the 6-second rebuild replay.

---

## 7. Build plan for the design lab

**Where.** `design-lab/manager-cards-claude/` on the lab branch (`claude/affectionate-galileo-8l9mxh`,
draft PR #380). Lab-only: nothing under `src/` changes, nothing is imported by the app, no
network, no external URLs (README). This is design exploration, not approved product screen work.
The product build later follows AGENTS.md "Screen work" (a committed brief, its own branch,
before/after and FR/AR screenshots at phone and desktop, a draft PR, no merge or deploy without
the owner).

**Step 0, brief first.** Commit `design-lab/manager-cards-claude/ONBOARDING.md` (what must be
preserved, the improvements, the acceptance criteria below) before any onboarding code, as the lab
did with `BRIEF.md`.

**New files**

| Path                                          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding.html`                             | A new page beside `index.html` and `preview.html`. Loads `src/fonts.css`, `src/app-context.css`, `src/brand.js`, `src/kit.js`, `src/contexts.js`, the five direction modules and `src/onboarding/*`. Query: `?c=07&v=v2&lang=ar&scheme=dark&screen=S08` renders one phone screen; without `screen` it lays out every screen for one direction in a grid of 390px phone frames. Sets `<html data-ready="1">` when fonts are ready, like the gallery. |
| `src/onboarding/states.js`                    | Fixture profiles, each labelled "sample": `guest`, `signedNoTeam`, `born0` (counted 0, serial null), `born0Serial` (serial `482913`), `forming1`, `eve2`, `notFinal2`, `insufficient3`, `rated` (84 PRO provisional), `ratedTrfNull`, `cleared` (85 not provisional), `tierUp`, `tierDown`, `founder`, `seasonClosed`, `seasonStarted`, `launchArrival`, `returning`, `clubNull`, `offline`, `featureOff`. All serials match `^[1-9][0-9]{5}$`.     |
| `src/onboarding/strings.js`                   | Every FR and AR string in section 3, with proposed dictionary keys (`card.onboarding.*`) so the product build can lift them. Plural helper on `Intl.PluralRules('ar')`.                                                                                                                                                                                                                                                                             |
| `src/onboarding/screens.js`, `onboarding.css` | Phone-frame renderers. App chrome is mocked in the lab's own `app-context.css` style (light and dark), never imported from the app. Selectors scoped under `.onb`.                                                                                                                                                                                                                                                                                  |
| `src/concepts/t1-touchline.js`, `.css`        | **Touchline (reworked)**, drawn fresh under `CONTRACT.md`, using the Codex render in `review/codex/` as reference only, with CRITIQUE.md's rework: no FUT spine stack, the exact logo blue `#0151FC`, the 84 and tier in its badge, long names, an Arabic face, the founder year after the name. Touchline is the fifth of the final top five and is not in this lab today.                                                                         |
| `tools/capture-onboarding.sh`                 | The capture matrix below, calling `tools/capture.mjs`.                                                                                                                                                                                                                                                                                                                                                                                              |
| `review/onboarding/`                          | Captures and an `INDEX.md` listing them.                                                                                                                                                                                                                                                                                                                                                                                                            |

**Contract extension (add to `CONTRACT.md`: "Onboarding states").** Today a profile always has a
number. Each of the five modules must accept:

- `p.ovr = null` and `p.tier = null`: the number carrier shows a dash; the base material with no
  tier word (section 9, decision 4).
- `p.counted` and `p.minRated`: k of N marks drawn natively on the object.
- `p.provisional`: no change to the art (the chip is app-level, beside the object), unless a
  direction's optional hint keeps the number readable (contrast read from pixels).
- `p.serial = null`: the ID carrier shows a dash; `p.founder = null`; `p.club = null` (own
  material); any stat `null` (dash).
- `o.beat`: one optional motion of 600ms or less over a visible number; off under reduced motion.
- `MC.label(p, o)` speaks « pas encore de note » / «لا تقييم بعد» for a null number.
- Both `full()` and `token()` support all of the above; `row()` supports the dash and « en
  formation k/N ».

**Each direction plugged in** (merged from Reveal §4 and Signing §6; each is the direction
designer's call)

| Part                                | 07 Écharpe (v2)                                                         | 03 Porte-clés (v2)                                   | 01 Lucarne                                                  | 05 Semelle (v2), provisional                                  | Touchline (reworked)             |
| ----------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------- |
| Number carrier with a dash          | Top band in plain rib, a knitted dash                                   | Blank engraving field, an engraved dash              | Empty top corner of the net, a dash                         | Blank forefoot field, a moulded dash                          | The badge's numeral slot, a dash |
| k of N marks                        | One stripe per counted gameweek (its v2 grammar)                        | Notches engraved round the rim                       | Chalk tallies on the post                                   | Marks along the flex groove, never studs (studs are the tier) | Ticks along the touchline        |
| Born "make" beat (M2)               | Cast-on and name band knit                                              | Name engraved, tag cut                               | Goal chalked on a wall (its HOMA origin)                    | Soleplate hung toe-up                                         | Person leaf fills                |
| First-rating beat over a visible 84 | The third stripe knits in below the 84                                  | Paint-fill runs into the engraved 84                 | Ball hits the corner where 84 already sits, one-beat freeze | Studs seat into the plate                                     | Badge settles on the line        |
| Founder ·26 and season carrier      | ALI ·26 in the name band, cream cast-on with 2026; one scarf per season | Squared split ring; one season ball charm per season | Footing with 26 in the iron plate                           | Moulded year clock                                            | ·26 after the name               |

**Screens to build** (phone 390 × 844 unless noted)

| #   | Screen                                                                                             | Fixture                                          | Moment   |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------- |
| S01 | Hub guest intro with the fifth point                                                               | `guest`                                          | M1a      |
| S02 | Name step: line and unnamed token, keyboard closed (no autofocus)                                  | `guest`, `signedNoTeam`                          | M1b      |
| S03 | Register hint; profile setup steps 1–2 with the live token (name typed, club tapped, club skipped) | `guest`, `clubNull`                              | M1c      |
| S04 | Back in the builder on the name step, focus on save                                                | `guest`                                          | M1c      |
| S05 | Team page with the M2 panel: new (serial null), new (serial set), arrival-forming                  | `born0`, `born0Serial`, `forming1`               | M2       |
| S06 | Hub block: forming 1/3, eve, not final, insufficient, late signer                                  | `forming1`, `eve2`, `notFinal2`, `insufficient3` | M3a, M3b |
| S07 | Rankings token, recap line, the three hints, the first-transfer line                               | `forming1`                                       | M3c–M3f  |
| S08 | Hub hero: fresh, arrival, coalesced                                                                | `rated`, `launchArrival`, `returning`            | M4a, M11 |
| S09 | Detail sheet: all stats; TRF null                                                                  | `rated`, `ratedTrfNull`                          | M4b      |
| S10 | League page band and rows; head-to-head sheet                                                      | `rated` plus league samples                      | M5       |
| S11 | Share sheet and the 1080 × 1920 image (FR and AR)                                                  | `rated`                                          | M6       |
| S12 | Provisional cleared line                                                                           | `cleared`                                        | M7       |
| S13 | Tier up hero; tier down line on the card page                                                      | `tierUp`, `tierDown`                             | M8       |
| S14 | Founder hero                                                                                       | `founder`                                        | M9       |
| S15 | Season closed hero; new season block with last season's number                                     | `seasonClosed`, `seasonStarted`                  | M10      |
| S16 | Card page with history and the Revoir list; replay frame 1                                         | `rated`                                          | M12      |
| S17 | Deletion request line; offline card page; feature off (hub as today)                               | `rated`, `offline`, `featureOff`                 | edges    |
| S18 | v2 only: the three-frame story                                                                     | `rated`                                          | M4c      |
| D1  | Desktop 1440: hub with the hero; card page                                                         | `rated`                                          | M4a, M12 |

**Captures** (`tools/capture.mjs` already supports width, height, viewport, colour scheme, a
language setting, and reports elements escaping the page width by their rectangles)

- **Lead direction, Écharpe:** every screen, French and Arabic, light and dark, at 390 × 844 and
  2x.
- **The other four:** the object-critical screens S05, S06, S08, S09, S10, S14 in French and
  Arabic light, plus Arabic dark.
- **Desktop:** D1 in French and Arabic, light.
- **Motion:** S05 and S08 captured once at t = 0 with motion on (no animation pause), to prove
  the number and the serial are already there; and once under reduced motion.
- Output `review/onboarding/<direction>/<screen>-<fr|ar>-<light|dark>.webp`, listed in
  `review/onboarding/INDEX.md`. Semelle captures carry a visible label « Test culturel en
  attente ».

**Acceptance criteria** (each measured, never asserted; CLAUDE.md "Evidence")

1. Every screen renders for every direction and fixture with no console error (capture.mjs
   collects them).
2. No element escapes the 390px width, measured by element rectangles, not `scrollWidth`.
3. Every button and link is at least 44 × 44, measured with `getBoundingClientRect`.
4. Text contrast at least 4.5:1, and 3:1 for the display number and large text, **read from
   rasterised pixels** of the capture (text and background samples), in light and dark. Not
   from hex tokens: `oklch` does not parse naively.
5. **The number is never held back:** in the t = 0 motion capture, the OVR element has opacity 1,
   is visible, and `document.elementFromPoint` at its centre returns it or a descendant. No
   count-up, flip, cover or blur exists in the code (review).
6. A null number renders "—", never "0" (DOM check on every null fixture), and the accessible name
   says « pas encore de note » / «لا تقييم بعد».
7. « Provisoire » / «مبدئي» is present on every surface showing a provisional number, the share
   image included.
8. No banned word in rendered text (section 5 list), checked by a search of `innerText` in both
   languages. No padlock, lock, question-mark or sealed icon in any card state.
9. No serial with a leading zero on the onboarding page; serial-null fixtures show no serial
   sentence.
10. No heading (`h1`–`h3`) contains the manager's name.
11. Arabic: `dir="rtl"` on each screen root; computed `letter-spacing` 0 on Arabic text; digits
    Western and isolated (`bdi` or U+2068…U+2069); names in Changa 800; stat and tier labels
    from `MC.STR`; the plural helper returns the right form for 1, 2, 3, 5 and 11.
12. Reduced motion: no running animation (`document.getAnimations()` empty) and no « Revoir »
    beat button.
13. Exactly one expanded hero or panel per screen; the `returning` fixture shows one coalesced
    hero.
14. ·26 and the founder part appear only in the `founder` fixture.
15. Formatting: `npx prettier --check design-lab/manager-cards-claude` and the repository lint
    pass; `node design-lab/manager-cards-claude/build.mjs` still builds the gallery.
16. The judges' fixes hold (Appendix A): a reviewer ticks each row against the captures.

**Not in this pass.** Changing `MC.ALI`'s serial for the existing gallery (it seeds concept 01's
texture and every existing capture). The onboarding page uses its own profiles. Migrating the
gallery is the owner's call (section 9, decision 9).

---

## 8. Backend needs (exact)

The full proposal is section 6a of [`BACKEND_HANDOFF.md`](BACKEND_HANDOFF.md). Summary:

1. **Acknowledged moments, recorded on the server (D21, new).** `app.manager_card_moment_acks`
   (`user_id` → `app.profiles(id)` on delete cascade, `moment_key text` with a check on the
   allowed shapes, `acknowledged_at timestamptz`, primary key `(user_id, moment_key)`), RLS
   forced, `revoke all`, written only by `api.ack_manager_card_moments(p_keys text[])`
   (security definer, `search_path ''`, step-up, idempotent, at most 16 keys, refuses a moment
   that does not exist yet so founder cannot be pre-acknowledged). Covered by account deletion
   through the cascade and named in the deletion runbook.
2. **Moments derived by the server, no event table.** Kinds: `card_created`, `first_rating`,
   `provisional_cleared`, `tier_changed`, `founder_granted`, `season_closed`, `season_started`,
   each with exact derivation rules from the card, season and history rows, returned as
   `moments[]` (pending only) in `api.get_my_manager_card()`.
3. **Read additions.** `rating_state` (`forming | insufficient | provisional | rated`),
   `gameweeks_counted`, `min_rated` and `min_confirmed` from the rules row,
   `through_gameweek_seq`, `calculated_at`, `rating_gameweeks` (the sequence numbers expected to
   complete the minimum, nullable), a closed set of null-reason codes per stat and for OVR,
   `previous_season`, `founder_granted_at` and `founder_cutoff_date`, `first_rated_gameweek_seq`,
   `best_tier`. A `forming` answer for any manager with a current-season team even before the
   card row exists (serial null).
4. **Public status.** `api.manager_card_status()` → `{enabled, min_rated, min_confirmed}`,
   callable by `anon`. No personal data, no counts, no `auth.uid()`.
5. **Batch read additions** (planned, Phase 4): `rating_state`, `gameweeks_counted`,
   `provisional`, `first_rated_gameweek_seq`.
6. **Tick behaviour.** It creates missing card rows for current-season managers (serial per D14,
   so it appears within one run of the first save; **no browser write at save**); writes the season
   row from the first final result, so k/3 is a server fact; writes history rows below the
   minimum with a null OVR, and the tier on every row.
7. **Launch order.** Compute on, catch up every evaluable gameweek, then read on.
8. **Verify first.** Club: profile setup writes `favorite_team_provisional_ref` only; the card
   read needs a resolution to `app.teams` or it returns a null club. Whether registration writes
   the full name into `display_name`. Which step-up test counts the acknowledgement write.
9. **Later, after D2, D3 and D5:** per-round ingredients for M3h's weekly fact.
10. **Nothing else.** No XP, no badges, no notifications, no Fantasy writes, no server analytics,
    and no prize, ranking or rule that reads a card or an acknowledgement. Everything ships off.

---

## 9. Open decisions for the owner

Short, each with a recommendation. **Owner's answer, 2026-10-08: yes to all nine**, so each
recommendation below is now the decision.

1. **D21. Record which moments a manager has seen, on the server.** This reverses D18's "defer
   any seen flag". **Recommend yes:** it is what stops a moment repeating on a second phone, and
   it measures whether people came back to their first number without per-person analytics.
2. **No browser write at save.** The card tick creates the card and its number within one run
   (15 minutes) of the first save; the save-day panel shows no number until then. **Recommend
   yes:** nothing is added to or slows the save.
3. **An anonymous on/off read** (`api.manager_card_status()`, no personal data) so guest copy
   never promises a card while the feature is off. **Recommend yes.**
4. **Unrated card material.** **Recommend the base material with no tier word** until a number
   exists (not HOMA printed before any rating).
5. **Club colour.** Profile setup saves the club as a provisional reference and nothing writes
   the club id the card reads. **Recommend resolving it on the server first**; until then no copy
   promises a club colour.
6. **Count imported teams as created teams** (`fantasy_team_created` on the import path).
   **Recommend yes, in its own commit:** today imports are missing from the activation count.
7. **Ship order.** v1: the inline moments, hero and detail sheet. The three-frame story only if
   people open the detail. The weekly fact only after D2, D3 and D5. **Recommend yes.**
8. **Names on shared cards.** Add the « un surnom suffit » hint and decide D20 (privacy line).
   Keep « signature » / «توقيع» out of the product unless the parents' sessions clear it.
   **Recommend yes.**
9. **Samples and Semelle.** Replace `BOT #004821` across the lab in a separate pass (D14 rejects a
   leading zero), and ship no onboarding moment on Semelle until its cultural test passes.
   **Recommend yes to both.**

The onboarding also depends on D1 (OVR as a mean, the detail footer), D2–D5 (tile formulas,
weekly facts), D7 (previous season shown), D8 (3 and 5), D9 (may tiers fall), D12 (passive
weeks, CAP before PR #376), D13 (founder), D14–D15 (serial), D17 (name), D19 (signed-in
visibility), D20 (privacy), and the lab's language questions (French or English on the Latin
card, Arabic tier names, the Arabic SEL label).

---

## Appendix A. The judges' findings and where they are handled

| Finding                                                                                                                 | Concept        | Judge | Handled in                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------- | -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asks the most of the backend (ingredients, reason codes, next counted gameweek, moments, history, first-rated in batch) | Reveal         | 1, 2  | Section 8: no `next_counted_gameweek` (client uses the hub's deadline data), one `rating_gameweeks` array, ingredients deferred to after D2/D3/D5, moments derived in the existing read, history read already planned            |
| If CON cannot be computed and no transfers, OVR stays null at 3/3                                                       | Reveal         | 1     | M3b "insufficient" state with a reason; D5's "verify first" on final boards flagged in the addendum                                                                                                                              |
| Day 0 thin; guest club colour does not exist                                                                            | Reveal         | 1, 2  | M1b guest token with no club; club only via profile setup and only once resolution works (M1c, decision 5)                                                                                                                       |
| M2 is an 88% sheet that opens without a tap                                                                             | Reveal         | 1     | M2 is an inline panel on the team page; nothing opens by itself                                                                                                                                                                  |
| Four-frame story invites ceremony creep                                                                                 | Reveal         | 1, 2  | v1 hero and detail sheet; story cut to three frames, v2, measured; criterion 5                                                                                                                                                   |
| League shame (a 52 HOMA among friends)                                                                                  | Reveal         | 1, 2  | Names-only band, rows in points order, no share on head-to-head, HOMA share guardrail                                                                                                                                            |
| Misses the import first-save path                                                                                       | Reveal, Build  | 1     | M2's data-driven trigger, invalidation in the import branch, decision 6                                                                                                                                                          |
| Gendered Arabic imperatives; «أنشئ فريقي»; «ج3» in body copy                                                            | Reveal         | 1, 2  | Section 5 copy discipline; verbal-noun buttons; «الجولة n»                                                                                                                                                                       |
| Name in M2's heading                                                                                                    | Reveal         | 2     | No name in any heading (criterion 10)                                                                                                                                                                                            |
| "Weekly event" true only for one cohort                                                                                 | Reveal         | 1     | The copy never says "weekly event"; launch handled as arrival                                                                                                                                                                    |
| The invite promise fails if a friend's OVR stays null                                                                   | Reveal         | 2     | Hedged: « leurs journées compteront en même temps que les vôtres »                                                                                                                                                               |
| Payoff weeks away with push and email off                                                                               | Reveal         | 2     | M2 panel, M3 counter, hints, recap line, invite; aha-reach measure; the rules-row lever                                                                                                                                          |
| Guest gating needs an anonymous status read                                                                             | Reveal         | 2     | `api.manager_card_status()`                                                                                                                                                                                                      |
| Reverses D18; sample `BOT #004821` breaks D14                                                                           | all            | 1     | D21; `BOT #482913` everywhere; lab migration as decision 9                                                                                                                                                                       |
| Ceremony at the least valuable moment; extra tap and latency; unrated share                                             | Signing        | 1, 2  | Interstitial cut; no wait on any call at save; unrated share cut                                                                                                                                                                 |
| Launch double-counted (arrival then first rating)                                                                       | Signing        | 1     | Arrival hero acknowledges both keys                                                                                                                                                                                              |
| « votre club » and « votre numéro » promised too early                                                                  | Signing        | 1, 2  | M1 copy promises neither                                                                                                                                                                                                         |
| مؤقت against the app's مبدئية; Latin "Fantasy" in Arabic                                                                | Signing, Build | 1     | Copy discipline: the app's root, agreeing with its noun. Signing's kicker is cut; where Fantasy must be named in Arabic it is «فانتازي», as the app writes it [code: `home.deadline_strip`]; only the brand BotolaGO stays Latin |
| «تمّ التوقيع» reads as a contract; parents                                                                              | Signing        | 1, 2  | The word is not used; parents' sessions first                                                                                                                                                                                    |
| Save preview under an autofocused keyboard                                                                              | Signing        | 1     | `autoFocus` removed; measured at 390 × 844                                                                                                                                                                                       |
| Builder hint row and crest strip push the pitch down                                                                    | Build          | 1, 2  | Cut                                                                                                                                                                                                                              |
| Arbitrary line-to-part metaphor; SVG cost on every pick                                                                 | Build          | 1, 2  | Cut; token only in compact surfaces                                                                                                                                                                                              |
| Built on unmerged PR #376                                                                                               | Build          | 1     | Builder lines only after #376 merges (M3g)                                                                                                                                                                                       |
| False claim that the club uses `favorite_team_id`                                                                       | Build          | 1     | Corrected in M1c and the addendum                                                                                                                                                                                                |
| Events with properties                                                                                                  | Build          | 1     | Distinct names only                                                                                                                                                                                                              |
| « Note confirmée »                                                                                                      | Build          | 1, 2  | Banned                                                                                                                                                                                                                           |
| Checklist close to TP-25                                                                                                | Build          | 1     | Cut                                                                                                                                                                                                                              |
| « N° bientôt attribué » promises a timescale                                                                            | Build          | 2     | No placeholder sentence; a dash on the carrier                                                                                                                                                                                   |

## Appendix B. Sources read

The three concept write-ups (working notes, not kept in the repository): Reveal in full, Signing
(§§3, 5, 6), Build (headings and the grafted parts), and the judges' scores in the task; the
Sorare onboarding research ([private page](https://claude.ai/artifact/4mvzoMabZp7f2xjKgsTcvv)) (At a glance, Part A, Part B with the Avoid
list, Part C, and the entries cited); [`BACKEND_HANDOFF.md`](BACKEND_HANDOFF.md) (all);
`.claude/skills/impeccable/reference/shape.md`, `onboard.md`, `mode-operate.md`;
`design-lab/manager-cards-claude/README.md`, `DIRECTIONS.md`, `CONTRACT.md`, `CRITIQUE.md`
(final top five), `src/kit.js`, `src/contexts.js`, `tools/capture.mjs`. On `origin/main` at
`3f9c57fc`: `src/routes/fantasy.create.tsx`, `src/components/fantasy/FantasyImportPrompt.tsx`,
`src/components/fantasy/FantasyGuestIntro.tsx`, `src/components/auth/AuthPromptDialog.tsx`,
`src/routes/auth.register.tsx`, `auth.verify.tsx`, `auth.profile-setup.tsx`,
`src/services/auth-supabase.ts`, `src/backend/identity/supabase-repositories.ts`,
`src/lib/analytics.ts`, `src/components/prizes/PrizeWelcome.tsx`, `src/routes/fantasy.index.tsx`,
`src/components/fpl/PlayerActionSheet.tsx`, `src/i18n/dictionary-fr.ts`, `dictionary-ar.ts`,
`docs/engineering/PEPITES_ARCHITECTURE.md` (no edition before round 3). GitHub API: PR #376 open,
`mergeable_state: dirty`; PR #380 draft on the lab branch (2026-10-08).
