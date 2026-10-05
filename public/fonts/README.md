# BotolaGO fonts

Self-hosted variable WOFF2 assets from Fontsource:

- manrope 5.3.0
- changa 5.3.0
- noto-sans-arabic 5.3.0
- ibm-plex-mono 5.2.5 (weights 500 and 600, Latin subset only). Since BG-0152
  no screen uses it; only the Pépites share images draw with it on a canvas
  (`src/components/pepites/share-image.ts`), until they are redrawn in the main
  look. Arabic labels use the Arabic faces.

Original SIL Open Font Licenses are included alongside each family.
Latin, Latin Extended and Arabic subsets preserve French and Arabic coverage.
Unicode ranges make browsers download only subsets used on the page.
No typeface or product typography tokens were changed.
