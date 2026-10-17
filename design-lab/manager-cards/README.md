# Manager Card design lab

Ten visual concepts, fixed fictional data, no product integrations. The owner chooses the direction. Open a concept for a larger card, compact leaderboard identity, emotional rationale, ownability, proposed tier materials and biggest risk. The ranking is a design judgment, not user research.

## Run locally

From the repository root:

```sh
node design-lab/manager-cards/build.mjs
python3 -m http.server 4311 --bind 127.0.0.1 --directory design-lab/manager-cards/dist
```

Open `http://127.0.0.1:4311/manager-card-gallery.html`. The generated HTML is also self-contained and can be opened offline in browsers that allow local HTML. It embeds the existing product fonts and logos and makes no external requests.

The directory is outside `src/` and `public/`. It has no production route, imports, links, release hooks, API clients, analytics or persistence. Do not copy it to `public/` or deploy it as part of the app. No build/publish commands in the existing app have been changed.

## Files and controls

- `app.js`: ten independently composed SVG cards, fixed profile, review notes and gallery interactions.
- `styles.css`: isolated gallery styles; original Manrope, Changa and Noto Sans Arabic fonts.
- `build.mjs`: embeds all resources into one HTML file in the supplied output directory (default `dist`, ignored by git).
- `subset-fonts.py`: optional fontTools/Brotli subsetting to fit the private Page embed limit; writes only to its output argument.
- `BRIEF.md`: preservation contract and visual acceptance criteria, committed before implementation.
- `QA.md`: actual verification evidence and known limitations.

Collection view shows full cards; overview shows all ten at once; ranking explains the ordering. Click or keyboard-activate a card, use next/previous or arrow keys, and close with Escape. Controls support English, French and Arabic/RTL. Detailed design review remains English and is explicitly labeled. Card identifiers and fixed Latin data retain LTR reading order.

All ten use ALI, 84 OVR, PRO, Morocco, a fictional club crest, 2026/27, BOT #004821, FOUNDER 2026 and CAP 91 / SEL 82 / TRF 86 / CON 78. The avatar function is an isolated slot, sized differently per composition; a photo or illustrated image can replace its internals using the same bounding box. Touchline clips the avatar to its leaf. Arcade intentionally uses a block illustration; a photo would occupy its rectangular window, not be forced into pixel art.

## Recommendation

1. Stadium Architecture
2. Touchline
3. Stadium Pass
4. Street
5. Terrace
6. Minimal Luxury
7. Broadcast
8. Future Botola
9. Digital Passport
10. Arcade

The full rationale is in the gallery. Ownability is potential, not a claim of trademark exclusivity. No other tiers or progression calculations have been implemented.
