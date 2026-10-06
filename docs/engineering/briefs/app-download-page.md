# Brief: the app download page

Approved screen work (AGENTS.md, "Screen work"): the owner asked on 2026-10-06
for a landing page that sends browser visitors to the phone app, with a QR
code, an App Store button and a Google Play button, using the app's own
assets. Written after inspecting the existing landing page (`/jouer`,
`src/components/landing/`) and the brand assets, before the first interface
change. The design direction is recorded in
`.impeccable/surfaces/src-routes-telecharger-tsx.md`.

This step adds the page at its own address. It does not hide or redirect any
other page: turning the website into this page alone is a later, separate
change (it must keep the app, the legal pages, account deletion, e-mail links
and admin working).

## What must be preserved

- Every existing page and route, unchanged. Nothing links to the new page yet
  except the QR code and the `/app` short link.
- The phone app: the shell opens `https://botolago.com`, and nothing here
  changes what it shows.
- The design system (`DESIGN.md`, `docs/engineering/DESIGN_SYSTEM_V2.md`): kit
  tokens and primitives, Changa and Manrope, logical properties only, 44px
  targets, light and dark, French and Arabic with right-to-left layout.
- The Two Blues Rule: Logo Blue appears only in the logo and the app icon.
- Data honesty: only features the app delivers today. No user counts,
  ratings, quotes, winners or prizes, and no push or e-mail alerts (switched
  off). Squad figures come from `SQUAD_RULES`.
- Independence: no FRMF, LNFP or club logo; the colophon repeats that
  BotolaGO is not affiliated with them.
- Image rights: stadium photos and the object illustrations already in
  `src/assets/` only; no player photos, no club crests.
- The official store badges are used as Apple and Google supply them, not
  redrawn or recoloured.

## Improvements

1. **`/telecharger`**, a page laid out like a matchday programme:
   - a cover: the night-stadium photo, the headline "Le football marocain,
     réuni.", a line on what the app holds, the QR code on a white plate
     (computers and tablets) and the two store badges;
   - five inside spreads, each one real part of the app with its own photo or
     illustration: live matches, news, Fantasy, Pronostics, Pépites; plus a
     strip on Morocco time;
   - a back cover: the app icon, the QR code again, the two badges and a
     colophon (operator, independence line, links to privacy, terms, account
     deletion and the support address).
2. **One button to the App Store and one to Google Play** (owner's request,
   2026-10-06). The two store addresses live in one file,
   `src/lib/app-download.ts`. Until the owner sends them, each badge is shown
   dimmed with "Bientôt disponible" / "قريباً" and is not a link.
3. **`/app`, the address inside the QR code.** It sends an iPhone or iPad to
   the App Store, an Android phone to Google Play, and everything else (or a
   store whose link is not set yet) to `/telecharger`. Printed codes keep
   working when the store links change.
4. **The QR code** is drawn by the page itself (an SVG from the `uqr`
   encoder, error correction H), navy on white with the GO mark in the
   middle, and assembles once in a sweep from the reading side on first
   paint (static under reduced motion).

## Acceptance criteria

Functional

- `/telecharger` renders on the server in French and switches to Arabic like
  every page; no hydration warning in the console.
- The QR code decodes to `https://botolago.com/app` (checked by decoding the
  rendered page, not assumed).
- `/app` answers 302: to the App Store for an iPhone user agent and to Google
  Play for an Android one when their links are set, otherwise to
  `/telecharger`; it is never cached by shared caches.
- With no store link set, a badge is not a link and says it is coming soon;
  with a link set, it opens that store.
- The page shows no app chrome (top bar, bottom nav), like `/jouer`.
- Unit tests cover the store choice for user agents and the redirect target;
  the existing test suite, typecheck and lint pass.

Visual

- Phone (390px) and desktop (1440px), French and Arabic, light and dark,
  captured before review. There is no "before": the page is new.
- On phones the QR plate is hidden and the badges come first; from 768px the
  QR plate shows beside the headline.
- No horizontal overflow at 360, 390, 768, 1024 and 1440px, measured from the
  rendered boxes (not `scrollWidth`, which `overflow-x: clip` hides).
- Text contrast at least 4.5:1 for body copy and 3:1 for large text, read
  from rendered pixels.
- Every tap target at least 44px; visible focus rings on the dark cover.
