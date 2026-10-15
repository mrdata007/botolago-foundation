# BotolaGO+ Rivaux: brief

Written before any interface change (AGENTS.md, "Screen work"). Owner-approved scope, 2026-10-15: idea 2
of the four new BotolaGO+ values, design v3 « Affiche de match ». Owner decisions that bind this work:

- the WhatsApp image shows the friend's **full name** (their display name, as the league already shows it
  to league mates), not an initial;
- no card rating (OVR) and no card figure ever goes on the image.

Research: the design folder's `RESEARCH.md` (outside the repository). Branch `claude/plus-rivals`.

## What it is

A member pins up to three friends from their private leagues. After each published journée they see, for
each rival, one poster: the round score, the season totals, who leads, the tally of journées won and lost,
a published stamp, and a WhatsApp-ready image of that poster. They can switch on a notification, off by
default, for when a published result changes who leads.

## What must be preserved

- Fantasy rules, scoring, the gameweek lifecycle and every league rule. Nothing here computes a score: every
  figure is read from the final results Fantasy already stored, through the same evaluable-journée test the
  Manager Card uses.
- Privacy: only what the league already shows every member (each journée's points, total and rank). A
  friend's captain and transfers appear **only** when they switched their card history on
  (`app.card_history_visibility`, default off, unchanged). Nothing is added to that switch.
- The free « Face-à-face » sheet and the member « Détail du duel » stay as they are.
- The BotolaGO+ switches: `PREMIUM_BUILD` / `usePlusAccess()` (off, locked, member). Off: nothing renders and
  nothing is requested. Checkout, cancel and restore still read « Bientôt disponible ».
- The brand and the night-stadium look already shipped; Changa / Manrope / Cairo; all text bold in the plus
  surfaces; the logo is drawn from `PlusLogo`, never typed.
- Rule fixes from the owner: never « provisoire » (use « en attente » / « بانتظار التقييم »); no card serial
  number; a missing rating is « sans note », never a number; no invented absence data.
- No prize, no money, no "débloquer", « premium », « pass », « membre » in copy; « vous » in French.

## Improvements made

1. **Backend (new migrations only, ships off):** a table of pinned rivals (cap 3, same active private league
   that season, row security forced, writes only through `api` functions, removed with the account); one read
   `api.get_my_rivals` returning every pinned rival's last published journée, totals, gap, leader, who led
   before, the season tally, the published stamp, the shared league and whether the friend shares their
   history; `api.pin_rival`, `api.unpin_rival`, `api.get_rival_candidates`, `api.set_rivals_notify`; a
   notification type `rival_lead_change`, French and Arabic templates, and a tick that is scheduled but does
   nothing until the owner switches it on (`app_private.rivals_settings`), and then only for members who
   opted in.
2. **Front end:** a repository (interface, Supabase, mock) and hooks; a « Vos rivaux » section on Curva's home
   with three states: off (nothing), locked (one real row clear, the rest a blurred example, « Découvrir »),
   member (the posters, the toggle, the add-a-rival list, the WhatsApp image). Dictionary keys in French and
   Arabic in one block per file.
3. **The image:** a 1080x1350 poster drawn on the phone with the share helpers the recap already uses: logo,
   league, both full names, the round score, the totals, the tally, the published stamp.

## Acceptance criteria

Functional
- Off: no node, no request. Locked: the reader's real free row (their total against the closest league mate)
  clear, the example blurred and inert, « Découvrir » to the paywall; the paid read is never called.
- Member: up to three posters; a fourth pin is refused with a clear message; a rival who leaves the league
  disappears from the board; a friend who keeps their history private shows « garde son historique pour lui »
  and no captain or transfer; a rating not yet published reads « en attente ».
- The notification toggle is off until the member turns it on; the copy says it arrives after publication,
  never during matches.
- The database: every new function is stable or volatile as appropriate, security definer, empty
  `search_path`, granted to `authenticated` only; new tables have row security forced and no grant; a
  non-member gets `{locked: true}`; a non-mate cannot be pinned; nothing is writable by anyone else.
- pgTAP file for the migrations; a guarded apply script (rehearsal that ends in a raise, then apply).
  No database is touched by this work.

Visual
- Match design v3: posters paged with snap, diagonal mint / sky split (mirrored in Arabic), glass panel,
  crowd band, dots that follow the scroll. Motion is transform and opacity only and off under reduced motion.
- French and Arabic (right to left) at 390 px, French at 1280 px; no horizontal overflow measured per
  element; text at least 12 px (body 14 px); contrast at least 4.5:1 read from rasterised sRGB; tap targets
  at least 44 px; 4 px spacing grid; Western digits in Arabic.

Checks before review: `tsc`, lint, `bun test src`, the i18n gate, prettier on changed files,
`backend:migrations:check`, before and after screenshots of the built screens.
