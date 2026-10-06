---
version: 1
slug: "src-routes-telecharger-tsx"
primary_target: "src/routes/telecharger.tsx"
related_targets: ["src/components/download"]
---

# Surface brief: the app download page (`/telecharger`)

**Mode: Persuade.** A visitor in a browser decides to install the BotolaGO phone app and gets it in one step.

- **Audience:** Moroccan football fans, at home or abroad, French and Arabic in equal measure. Most arrive on a computer (they scan the code with their phone) or on a phone (they tap a store button).
- **Action:** scan the QR code, or tap "App Store" / "Google Play". The QR code opens `https://botolago.com/app`, which sends an iPhone to the App Store, an Android phone to Google Play, and anything else back to this page, so a printed code never goes stale.
- **Proof:** only what the app really does today: live scores, calendar and table, match pages (Résumé, Stats, Compos, Face à face), news in both languages, Fantasy (squad rules from `SQUAD_RULES`), Pronostics (3 and 1 points), Pépites (under 23), Morocco time. No user counts, ratings, quotes, prizes or push alerts (switched off).
- **Constraints:** store links are not known yet (owner sends them later); until then each badge says "coming soon" and is not a link. Official store badges are used unaltered. Kit tokens only; dark mode, French and Arabic (RTL) all work. No business logic changes.
- **Not in scope:** turning the rest of the website off (a later, separate step).

## Direction contract

THESIS: The page is a matchday programme: a cover, a few inside spreads, a back cover. It refuses the category's app-download template (a phone mock-up beside a headline and two badges, then a grid of feature cards).

OWN-WORLD: BotolaGO's own system: Tunnel Navy cover under the night-stadium photo, white programme pages on Terrace Mist, Changa 800 headlines, Manrope body, the white score-plate lift reserved for the QR code, the spring-to-sky gradient only on the one primary element per screen, club-free imagery (stadium photos and the 3D object illustrations), Logo Blue only in the logo and app icon.

STORY: The visitor sees the promise and the code at once, understands what is inside from the cover lines, flips through five spreads that each show one real piece of the app, and meets the code and the two store buttons again on the back cover.

FIRST VIEWPORT: Full-bleed night-stadium photo under a navy veil. Masthead row: white wordmark at the start; "Saison 2026/27" and the language switch at the end. A huge two-line Changa headline at the start edge, the lede under it. At the end edge on desktop, the white QR plate (the cover's "barcode panel") with the GO mark in its centre, its caption, and the two store badges under it. On phones the QR plate is hidden and the two badges sit right under the lede. Cover lines along the bottom edge link to each spread.

FORM: Matchday programme, first of three on the dealt list (team sheet, kick-off spot); seed key a7b23f01. Signature motion: the QR code assembles in one sweep from the reading side on first paint (off under reduced motion).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
