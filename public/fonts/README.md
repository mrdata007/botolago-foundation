# BotolaGO fonts

Self-hosted variable WOFF2 assets from Fontsource:

- manrope 5.3.0
- changa 5.3.0
- noto-sans-arabic 5.3.0
- instrument-serif 5.3.0 (400 normal, Latin and Latin Extended only): the second line of a Manager Card's
  name. It is the card's own face: it is declared in `eclat.css` (not in `src/fonts.css`), so it is
  requested only when a card is drawn and never with the Manager Card section switched off.

Self-hosted static WOFF2 subsets from Google Fonts (2026-10-13), for the collector shield card's
autograph (`src/components/manager-card/shield/`). Declared in `shield.css`, not in
`src/fonts.css`, so they too load only when a card is drawn:

- Mr Dafoe 400 (Alejandro Paul, OFL), Latin and Latin Extended: a Latin name's signature.
- Aref Ruqaa 700 (The Aref Ruqaa Project Authors, OFL), Arabic only: an Arabic name in Ruq'ah.

IBM Plex Mono was removed in BG-0153: no screen had used it since BG-0152, and
the share images (`src/components/pepites/share-image.ts`, the Fantasy recap)
now draw with Changa, Manrope and Noto Sans Arabic like the rest of the app.

Original SIL Open Font Licenses are included alongside each family.
Latin, Latin Extended and Arabic subsets preserve French and Arabic coverage.
Unicode ranges make browsers download only subsets used on the page.
No typeface or product typography tokens were changed.
