# BotolaGO+ Trophées: « La vitrine éclairée »

Screen-work brief (AGENTS.md, "Screen work"). Written before any interface change, on branch
`claude/plus-trophies`, based on `origin/main`. Owner-approved 2026-10-15: idea 5, design v1
« La vitrine éclairée » (a lit glass cabinet, one shelf per family). The approved static mock lives
outside the repository; this brief records what it asks for and the rules the owner added.

Owner decisions that bind this work:

- A trophy is NEVER taken back. Once earned it stays, including after a corrected result. There is no
  `withdrawn` state anywhere.
- Trophées are earned by playing, by everyone. The subscription changes only the presentation: the
  cabinet, the frames on the card and the 9:16 story card. It never sells or changes a point, a
  rating, a tier or a rank.
- The word « provisoire » is never used: « en attente » / « بانتظار التقييم ».
- No card serial number on any trophy screen or image. A rating that is missing reads « sans note »,
  never a number.

## What must be preserved

- Fantasy rules, scoring, the gameweek lifecycle, the Manager Card calculation and its tiers: not
  touched. Trophées only READ what is already stored and final.
- The prize system (`app.fantasy_prizes`, `fantasy_prize_winners`): not touched, not resembled. French
  word « trophée », Arabic « كأس / كؤوس ». Never « prix », never « جوائز »; no money, no lot.
- The BotolaGO+ switches: `PREMIUM_BUILD`, `usePlusAccess()` (off / locked / member). Off renders
  nothing and requests nothing. The locked pattern (`PlusLockedSection`), the paywall route
  (`/curva/plus?step=3`), the lock chip, the logo (`PlusLogo`, the name is never typed).
- The cosmetic precedent `app.card_editions`: a frame is drawn on top of the card, public where the
  card is drawn, reverts to standard when the membership ends, and the choice is remembered.
- Vocabulary: « abonnement », « Découvrir » (اشتراك / اكتشف). French « vous ». No « débloquer »,
  « premium », « pass », « membre ». Western digits, mirrored right-to-left Arabic.
- Existing tests, the i18n gate, the 4px-grid CSS lint, the ui-kit rule on `rtl:` flips.

## What changes

Backend (forward-only migrations 20261015150000 to 20261015150300, guarded script, pgTAP):

1. `app.trophy_catalog` (rules version 1, 11 trophies in five families: Paliers, Journées, Décisions,
   Ligue, Carte) and `app.trophies_earned` (one row per user, trophy and season, written only by the
   evaluator, never updated in its facts, never deleted by any function).
2. `app.card_frames`, `app.card_frame_choices`, `api.choose_card_frame` (earned check and membership
   check), `app_private.card_frame_effective` (standard when the membership ended).
3. `app_private.trophies_evaluate_user` and the job `trophies-tick` (every 30 minutes), OFF behind
   `app_private.trophy_settings`, with its prune job; AGENTS.md gets its paragraph.
4. `api.get_my_trophies(p_season)`: earned, pending, progress served by the server, the published
   stamp of each trophy, the frames earned and the one chosen. `api.get_trophy_card_frames(uuid[])`
   serves the frame other people see on a card.
5. Ack key regex extended to `trophy:*` so a later "new trophy" moment can be acknowledged.

Front end: a « Trophées » section on Curva's card page with three views in one component.
Vitrine (cabinet: shelves, plaques, silhouettes, the rule, share and frame buttons), Trophée (the
detail, the 4:5 share card, WhatsApp and save free, framed 9:16 for members) and Cadres (the frame
picker on the Manager Card). Repository interface, Supabase implementation, mock (Karim B.), hook,
dictionary block fr/ar.

## Rule fixes applied to the design

Never « provisoire »; never the serial « n° 482913 » (the Fondateur plaque says « Fondateur 2026 »
and the cohort only); the pending plaque says which journée waits, never invents a player; share
image footer « botolago.com · Fantasy Botola Pro ».

## Acceptance criteria

Visual

- Vitrine, trophy detail and frame picker match the approved mock in French and Arabic (390px) and
  French (1280px) as member; the locked view shows the earned list clear and the cabinet blurred with
  « Découvrir »; the off view renders nothing.
- Earned plaques are lit, the pending one is dashed and dimmed, those to earn are flat silhouettes
  with a thin progress bar. Text at least 12px (body 14px), all weights 700 or more, contrast at least
  4.5:1, tap targets at least 44px, no overflow per element, 4px grid.
- Motion: transform and opacity only; all of it off under `prefers-reduced-motion`.

Functional

- A guest never reaches the section (Curva is already locked for them).
- Off: no node, no request. Locked: the free trophies read is made, the frame choice is not offered
  as an action (Découvrir instead). Member: all of it.
- A trophy once shown is never removed by a later read, whatever the calculation does.
- Every trophy carries « Publié le … » (the final-result time of the gameweek that earned it);
  progress figures come from the server.
- Backend: the evaluator and every read are display-only; no ranking, league, Fantasy or Manager
  Card function reads trophies or frames; pgTAP covers grants, RLS, off/locked/member answers, the
  never-withdrawn guarantee and the frame rules. Nothing is applied to any database by this branch.

## Changes made while building (the brief above was written first)

- Three migrations (20261015150000 to 20261015150200), not four, and twelve trophies, not eleven
  (`league_leader` was added with `league_podium`).
- No change to the Manager Card moment acknowledgements: « Nouveau » is derived from `earnedAt` (the
  newest trophy, within seven days), so the `trophy:*` key regex is not needed.
- Owner decisions of 2026-10-15, after the first build:
  - Visibility. The trophies earned (never points, ratings or tiers) are visible by default to the
    managers who share a private Fantasy league with you this season; never to strangers, nor in
    public or overall leagues. « Montrer mes trophées » (« إظهار كؤوسي ») hides them: on by default,
    on the trophies page and in Profil › Mon abonnement. `app.trophy_visibility`,
    `api.set_trophies_visibility`, `api.get_league_member_trophies`; in Curva's « Les vôtres » a mate
    who shows trophies has a small trophy count chip that opens them read-only. Looking is free and
    follows the cabinet's own gate (earning is free for everyone, as above).
  - The league podium and the league champion (« En tête de votre ligue » became « Champion de votre
    ligue ») are given only at the end of the season, from the final standing of a private league of
    at least three managers, once the season's last gameweek is final and published. Before that the
    cabinet shows « en cours » and the rank today; an earned trophy is still never taken back.
  - No backfill: trophies are evaluated for the current season going forward only.
- The frame is drawn around the member's own card on Curva's card page, in the picker and in the
  share image. `api.get_trophy_card_frames` serves it for other people's cards, but the rankings and
  league lists do not call it yet.
- On a wide screen the cabinet keeps the card page's column width, and the detail replaces the
  cabinet in place instead of opening a side panel.
