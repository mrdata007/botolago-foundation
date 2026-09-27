# BotolaGO Pépites — Figma implementation spec

Figma file `DEQTspI8A04pjmLcAYTYw4`. Pages: `0:1` Cover, `2:25` Components, `2:26` Mobile · FR,
`2:27` Mobile · AR, `2:28` Desktop · FR, `2:29` Share images, `2:30` Admin.
(`get_metadata` without a node only listed Cover and Components. I found the other pages by probing the ids `2:26`–`2:30`.)

Screenshots: `figma/<node-id-with-dash>.png`. SVG assets: `figma/assets/`. The player photos (PNG) were **not**
downloaded. They are unlicensed placeholders ("INTERNAL PLACEHOLDER — SportsMonks image, no public licence").

Coordinates are in px and relative to the screen frame (x, y, w, h). A text's y is the **top of its text box**. Figma uses
`line-height: normal`, and the box heights that implies are Changa ≈ 1.84 em, Manrope ≈ 1.37 em, IBM Plex Mono ≈ 1.3 em and
Noto Sans Arabic ≈ 2.0 em. Tracking is given in px, with the % of font size in brackets.

## 0. Global tokens (used everywhere)

- Night `#070D24` (dark bg / night band) · nav dark `#0A1130` · page light `#F3F5FA` · card `#FFFFFF`
- Ink/brand navy `#1B2A6B` · text `#0B1330` · text-2 `#5D6789` · on-dark muted `#9AA4C7` · on-dark soft `#C9D2EA` · quote `#E4E9F7`
- Hairline `#E3E7F0` · empty bar `#DFE3EE` · nav idle text `#7B84A3` (light) / `#7E89AD` (dark) · primary-btn text `#0D1F4A`
- Accent mint `#5DE39B` · warning/"N.R."/missing photo `#FFB020`
- **Energy gradient** (`E`): `linear-gradient(90deg,#5DE39B 0%,#7FD6F0 45%,#7C6CF0 100%)`. Every one sampled in FR runs left→right.
- **Primary button gradient**: `linear-gradient(180deg,#7DF0AC,#8FE3F2)`. It is vertical: gradientTransform [[0,1,0],[-1,0,1]].
- Club colours seen: IRT `#1E5BB8`, HUSA `#E63900`. Feed placeholders also use `#0A7A3C` (green), `#C8102E` (red), `#3A3F4B` (grey) and `#1B2A6B`.
- Fonts: **Changa ExtraBold 800** (display, numbers, names; it also sets Arabic names) · **Manrope** ExtraBold 800 / Bold 700 / SemiBold 600
  (UI) · **IBM Plex Mono** Medium 500 / SemiBold 600 (data labels, all-caps copy typed literally in caps, textCase ORIGINAL) ·
  **Noto Sans Arabic** Medium / SemiBold / Bold (AR UI).
- **Slant**: Figma matrix [[1,-0.1386],[0,0.9903]] on the node origin is CSS `transform-origin:0 0; transform: skewX(-7.97deg) scaleY(.99)`.
  It applies to: ghost numbers, the player name on 03, the story name lines, the "70" on the share card, the reveal underline, feed ranks/scores and "TOP 10".
- **Ghost number** (big rank behind the content): Changa ExtraBold, `color:transparent`, stroke white @12% 1.5px OUTSIDE.
  In CSS use `-webkit-text-stroke:1.5px rgba(255,255,255,.12)`, which gives the same visible band width because the fill is transparent.
  On the feed it is 3px @7%.
- Card: white, radius 14, `box-shadow:0 6px 16px rgba(11,19,48,.07)`, padding 12/14, column gap 9.
- Glows are circles with a layer blur. Figma blur R becomes CSS `filter: blur(R/2)`, so 64→32px and 80→40px.
- Decimals use a comma ("6,60"). Thousands use a space ("1 004", "1 159"). The minute mark is ’ (U+2019). The plus in the buttons is the fullwidth "＋" (U+FF0B).

---
## 1. `7:166` 03 · Joueur — Aperçu (FR)  (390×844, bg `#F3F5FA`)  → `figma/7-166.png`

Background layers (bottom → top):
- Night band (0,0,390,410), a vector polygon `(0,0)(390,0)(390,386)(0,410)` filled `#070D24`. The bottom edge rises 24px from left to right.
  CSS: `clip-path:polygon(0 0,100% 0,100% 386px,0 410px)`. The SVG also has a 1px black stroke, probably accidental.
  Asset: `assets/7-166-night-band.svg`.
- Club glow (IRT): circle 240 at (10,60), `#1E5BB8` @80%, blur 64 (CSS 32px). Asset: `assets/7-166-club-glow-irt.svg`. Data: club colour.
- Ghost "05": Changa ExtraBold 250, ghost-number stroke, slanted, origin (150,30). The visual bbox is (86,30,380,456) and it is clipped by the frame.
  Data: rank, zero-padded to 2 digits.

Content:
- StatusBar dark (0,0,390,44): px28, space-between, Manrope ExtraBold white. "20:03" is 15px and "●●● 5G" is 12px (static OS chrome).
- "‹ Classement" (18,56): Manrope ExtraBold 13 white. Static back link.
- Follow button, ghost-dark (226,48,120,38): bg rgba(255,255,255,.08), 1px inside border rgba(255,255,255,.2), radius 999,
  px18. Label "＋ Suivre · 1 284" is Manrope ExtraBold 13 white. "1 284" is the follower count (data). The label is 99px wide, wider than the
  84px content box, so it spills into the padding. Use an auto width in code.
- Cutout photo (8,84,176,176): object-contain, `drop-shadow 0 10px 16px rgba(0,0,0,.5)`. This is the placeholder PNG. Without a licensed
  cut-out, fall back to ShirtFallback (§8).
- ScoreRing dark instance: box (286,140,84,84), but its children were **not scaled**. The ring draws at **72×72 anchored to the top-left (286,140)**
  (see §8 ScoreRing). Score "70" is data. Label "RISING" is static.
- "#5 · U23 BOTOLA" (268,234): IBM Plex Mono SemiBold 9 `#5DE39B`, tracking 1.08 (12%). "#5" is data.
- Name "Mohamed El Arouch": Changa ExtraBold 28 white, **slanted**, origin (22,262), box 254×52. Data.
- Meta (18,300): IBM Plex Mono Medium 10 `#C9D2EA`, tracking 0.4 (4%). The text is "ITTIHAD TANGER · DÉFENSEUR · 22 ANS · PIED : " followed by
  "N.R." in `#FFB020`. Club, position, age and foot are data. "N.R." is the "not provided" token and gets the warning colour.
- FactsStrip (16,318,358,44): 1px border top and bottom (inside) rgba(255,255,255,.12). There are 4 equal cells (flex 1), each a column, centred, py8, gap 3.
  The value is Changa ExtraBold 18 white. The label is IBM Plex Mono Medium 8 rgba(255,255,255,.7), tracking 0.8 (10%).
  Cells: **17 / MATCHS · 15 / TITUL. · 1 159 / MINUTES · 6,60 / NOTE**. Labels are static and values are data.
  ⚠ The cells are 62 tall inside a 44-tall strip, so in the render **the labels sit just below the bottom hairline** (see the screenshot).
  (The cell layer names BUTS/MINUTES/NOTE/B+PD90 are stale and do not match the labels shown.)
- Tabs (18,408), row gap 18. Items are Manrope ExtraBold 13. Active "Aperçu" is `#1B2A6B` with a 46×3 `#1B2A6B` underline 4px below (top 22).
  "Matchs" and "Stats" are `#5D6789`, vertically centred.
- "＋ Fantasy", primary button (262,400,120,38): primary gradient, radius 999, text `#0D1F4A` Manrope ExtraBold 13.
- **PERCENTILES card** (16,448,358,154), card style:
  - Head row (330 wide, space-between, baseline): "PERCENTILES" Manrope ExtraBold 11 `#0B1330`, tracking 0.66 (6%). Right side is
    "vs 26 U23 · 600+ min", IBM Plex Mono Medium 9 `#5D6789`. "26" is data (the cohort size) and 600+ min is the eligibility rule.
  - 5 × PercentileRow (330×14, rows start at y 36 and step 23). The rows are **Note moyenne 65 · Forme · 6 m. 77 · Contribution 90 ·
    Progression 62 · Temps de jeu 50**. Labels are static and percentiles are data. The Seg10Bar value is round(p/10), giving 7, 8, 9, 6 and 5.
- **PERCÉE card** (16,612,358,112), card style:
  - Head: "PERCÉE" (same style as "PERCENTILES") and "minutes par demi-saison" (IBM Plex Mono Medium 9 `#5D6789`).
  - Bars row (14,36,330,64): flex, items-end, gap 10.
    - Column 1 (w96) is a bar 96×6 `#DFE3EE` with top radii 4, then gap 4, then "1RE MOITIÉ · 155’" in IBM Plex Mono SemiBold 9 `#5D6789`.
    - Column 2 is a bar 96×40 filled with **E**, top radii 4, then "2DE MOITIÉ · 1 004’" in IBM Plex Mono SemiBold 9 `#1B2A6B`.
    - Column 3 (gap 2) is "×6,5" in Changa ExtraBold 28 `#1B2A6B`, then "TEMPS DE JEU" in IBM Plex Mono Medium 8 `#5D6789`, tracking 0.64 (8%).
    - Bar height = 40 × minutes / max(minutes), so 155 gives 6px. "×6,5" = 1004/155 with one decimal. Minutes and the multiplier are data.
- BottomNav light at (0,768), Pépites active (§8).

---
## 2. `10:505` 04 · Joueur — Matchs (FR)  (390×844, bg `#070D24` everywhere)  → `figma/10-505.png`

- StatusBar dark (0,0).
- Header (18,52): row, gap 10, centred.
  - Headshot 42×42 (radius 21). This one is a photo placeholder; use Headshot/placeholder when there is no licensed photo.
  - Text column, gap 2: "Mohamed El Arouch" in Changa ExtraBold 20 white, then "IRT · DEF · #5 · RISING 70" in IBM Plex Mono Medium 9 `#9AA4C7`,
    tracking 0.54 (6%). Club code, position, rank and score are data.
- Tabs (18,112), gap 20, Manrope ExtraBold 13. "Aperçu" and "Stats" are `#9AA4C7`. Active "Matchs" is white with a 48×3 underline in **E**, 4px below.
- Divider (0,142,390,1): rgba(255,255,255,.08).
- **Trend card** (16,156,358,118): bg rgba(255,255,255,.04), 1px inside border rgba(255,255,255,.08), radius 14, clips its content.
  Coordinates below are card-local.
  - "NOTE · 10 DERNIERS MATCHS" at (11,9): Manrope ExtraBold 10 white, tracking 0.6 (6%).
  - "2025-26" at (304,10): IBM Plex Mono Medium 9 `#9AA4C7`. Season (data).
  - Season-average line: x 13→343 at y 76.2, 1px white @20%, dash 3/3 (`assets/10-505-trend-avg-line.svg`).
    Its label "MOY. SAISON 6,60" sits at (271,65.2) in IBM Plex Mono Medium 7 `#9AA4C7`. The average is data.
  - Polyline over 10 points, stroke 2.4 in **E** (horizontal, across the whole line), no fill (`assets/10-505-rating-trend.svg`).
    - x_i = 17 + i·35.78 for i = 0..9, running **oldest → newest, left → right**.
    - y = 41.64 + (max−r)/(max−min)·51.8, a min–max scale over the 10 ratings (highest 7.6 → 41.64, lowest 6.1 → 93.44).
      The average line checks out: 6.60 gives 76.2.
    - Point dots are 8×8 (r 3.25) filled with the RatingChip band colour, with a 1.5 `#070D24` stroke, centred on each point
      (`assets/10-505-dot-{a..d}.svg`).
- **Match log** (16,286), 356 wide. Columns have gap 4 and these widths:
  DATE 40 · ADVERSAIRE 132 · SCORE 38 (right) · MIN 44 (right) · B/PD 42 (right) · NOTE 40 (right-aligned chip).
  - Header row: py6, bottom border 1px rgba(255,255,255,.07). Text is IBM Plex Mono SemiBold 8 `#9AA4C7`, tracking 0.64 (8%).
    Labels: "DATE", "ADVERSAIRE", "SCORE", "MIN", "B/PD", "NOTE".
  - Rows: 33 tall, py7, same bottom border.
    - Date: IBM Plex Mono Medium 10 `#9AA4C7`.
    - Opponent: Manrope Bold 11 white, written "D · X" for home (Domicile) or "E · X" for away (Extérieur).
    - Score and min: Manrope Bold 11 white. "24’ R" means he came on as a substitute (R = remplaçant).
    - B/PD: Manrope ExtraBold 11. It shows "–" in `#9AA4C7`, or "1B" / "1PD" in `#5DE39B`.
    - Note: a RatingChip inside an 18-tall frame, right-aligned.
  - Data (newest first):
    - 05.07 · D · CODM Meknès · 2-1 · 40’ · – · 6,5
    - 28.06 · D · Raja · 1-1 · 90’ · 1PD · 6,4
    - 14.06 · D · Y. El Mansour · 2-1 · 77’ · – · 6,3
    - 08.06 · E · RSB Berkane · 0-1 · 71’ · – · 6,8
    - 03.06 · D · Wydad AC · 2-1 · 90’ · 1B · 7,3
    - 22.05 · E · Maghreb Fès · 1-0 · 24’ R · – · 7,0
    - 10.05 · D · DHJ · 1-1 · 90’ · – · 7,6
    - 06.05 · E · FUS Rabat · 1-1 · 65’ · – · 6,1
    - 29.04 · E · Olympic Safi · 2-1 · 46’ · – · 6,1
    - 25.04 · E · HUSA · 1-1 · 66’ · – · 6,5
- BottomNav **dark** at (0,768).

---
## 3. `11:476` 06 · Révélation du lundi (FR)  (390×844, full-screen story: no status bar, no bottom nav)  → `figma/11-476.png`

- Background: `radial-gradient(195px 527.5px at 50% 56.25%, #1E4FA0 0%, #0D1738 55%, #070D24 100%)`.
  Those are the true Figma stops. The design-context data URI shows interpolated extra stops.
- Story progress (16,50): 10 bars of 31×3, radius 2, gap 4. The first 6 are white and the rest are rgba(255,255,255,.3).
  Data: the reveal counts down 10→1 and N°5 is the 6th story.
- GoMark FR (16,66). "TOP 10 · LUN. 20:00" at (262,72): IBM Plex Mono Medium 9 `#C9D2EA`, tracking 0.72 (8%). Static.
- Ghost "5": Changa ExtraBold **330**, ghost-number stroke, slanted, origin (90,70), visual bbox (6,70,279,601). Data: rank without padding.
- Cutout (80,300,230,230) with `drop-shadow 0 10px 16px rgba(0,0,0,.5)`. Placeholder PNG, do not ship it.
- Underline: rect 170×4 in **E**, **slanted**, origin (110,528). It sits under the photo's chin.
- Name "Mohamed El Arouch": Changa ExtraBold 32 white, centred, box (15,540,360). **Not slanted.**
- Meta "ITTIHAD TANGER · DÉFENSEUR · 22 ANS" at y 584: IBM Plex Mono Medium 10 `#C9D2EA`, tracking 0.6 (6%), centred, w360.
- Key stats (16,610): 3 tiles of 114×73, gap 8. Each tile has bg rgba(255,255,255,.08), 1px inside border rgba(255,255,255,.14),
  radius 12, py9, and a centred column with gap 3.
  - Value: Changa ExtraBold 22 white. Label: IBM Plex Mono SemiBold 8 `#C9D2EA`, tracking 0.8 (10%).
  - Tiles: **70 / RISING · 1 004’ / 2DE MOITIÉ · 6,72 / FORME** (data; the labels depend on the player's highlight).
- Quote (30,688,330): Manrope Bold 12 `#E4E9F7`, centred.
  «&nbsp;155 minutes en première moitié de saison, 1 004 en seconde : il s’est imposé dans le XI de Tanger.&nbsp;»
  This is the editorial sentence from the admin Top-10 tool (one FR and one AR phrase per player).
- Buttons at y 764, h 42, w 174:
  - Primary "＋ Suivre" at x 16.
  - Ghost-dark "Suivant · N°4 →" at x 200. The next rank is data.

---
## 4. `11:515` 07 · Carte à partager — story 9:16 (FR)  (390×**694**, bg `#070D24`)  → `figma/11-515.png`

The 1080×1920 export on the Share images page (`29:284`) is this card scaled by exactly ×2.769 (1080/390).
- Glow: circle 280 at (40,170), `#1E5BB8` @60%, blur 80 (CSS 40px) (`assets/11-515-glow.svg`). Its centre (180,310) is slightly left of the chart centre.
- Ghost "05": Changa ExtraBold 190, ghost stroke, slanted, origin (160,30).
- GoMark FR (20,26). "U23 · BOTOLA PRO" at (270,32): IBM Plex Mono Medium 9 `#C9D2EA`, tracking 0.72 (8%).
- "MOHAMED" is Changa ExtraBold 38 white, slanted, origin (22,68).
- "EL AROUCH" is Changa ExtraBold 38 filled with **E** (`background-clip:text`), slanted, origin (22,104).
  The first name and surname are upper-cased and split onto two lines (data).
- Meta "ITTIHAD TANGER · DÉFENSEUR · 22 ANS" at (20,158): IBM Plex Mono Medium 10 `#C9D2EA`, tracking 0.6.
- **Radial percentile chart**: box (67,190,256,256), centre C = (195,318).
  - 5 annular sectors, one per metric, running clockwise from 12 o'clock.
    Slice i (0-based) spans **−90° + 72°·i + 2.865° → −90° + 72°·(i+1) − 2.865°**. That is a 0.1 rad total gap
    (Figma arcData start −1.5208, end −0.3642 for slice 0).
  - Track: inner r **62**, outer r **128**, fill white @6%.
  - Value sector: same angles, inner r 62, **outer r = 62 + 66·p/100**. The radius is linear in p, not in area.
    Measured outer radii: 65→104.9, 77→112.82, 90→121.4, 62→102.92, 50→95.
  - Slice colours and values (data):
    - 0 Note moyenne `#4F6BFF` 65
    - 1 Forme `#22B8CF` 77
    - 2 Contribution `#2FCF7F` 90 (bottom)
    - 3 Progression `#8B6CF6` 62
    - 4 Temps de jeu `#F0A020` 50
  - Value labels: IBM Plex Mono SemiBold 10 `#C9D2EA`, centred at r ≈ 142 on each slice's mid-angle (−54°, 18°, 90°, 162°, 234°).
  - Centre disc: 116 circle at (137,260) with `radial-gradient(circle 58px at 50% 70%, #1E5BB8, #0B1A3D)`.
    The headshot (116, round) sits on top.
  - Assets: `assets/11-515-slice{1..5}-{track,valueNN}.svg`, `assets/11-515-center-ellipse.svg`.
- Legend (30,470,330): flex-wrap, centred, gaps 6 (rows) and 10 (columns). Items have gap 4: an 8×8 swatch with radius 2, then the label in Manrope Bold 10 `#C9D2EA`.
  The order is Note moyenne, Forme, Contribution, Progression, then "Temps de jeu" wraps to the 2nd row. Static.
- Divider (20,540,350,1): rgba(255,255,255,.15).
- "70": Changa ExtraBold 64 in **E** text, slanted, origin (22,556). Data.
- Text column at x 120:
  - "RISING SCORE · N°5" at y 570: IBM Plex Mono SemiBold 9 `#5DE39B`, tracking 1.08 (12%).
  - "1 159 MIN · NOTE 6,60 · 155’ → 1 004’" at y 588: IBM Plex Mono Medium 9 `#C9D2EA` (data).
  - "botolago.com/pepites" at y 612: IBM Plex Mono SemiBold 10 white (static).

---
## 5. `21:404` S1 · État — chargement  → `figma/21-404.png`

- bg `#F3F5FA`. Night band (0,0,390,226) is the polygon `(0,0)(390,0)(390,200)(0,226)` in `#070D24` (`assets/21-404-night-band.svg`).
  Same shape family as §1, but 26px of slant.
- StatusBar dark. GoMark FR (18,54).
- Two skeletons on the band. Fill: `linear-gradient(90deg, rgba(227,231,240,.25), rgba(241,243,248,.25) 50%, rgba(227,231,240,.25))`.
  - (18,100,160,14), radius 7. This stands for the eyebrow.
  - (18,124,90,60), radius 8. This stands for the big score.
- 7 skeleton rows: cards 358×58, white, radius 14, **no shadow**, at x16 and y = 250 + 68·i (gap 10).
  - Inner blocks: (12,19,20,20) r8 rank · (42,11,36,36) r8 headshot · (90,14,150,12) r6 · (90,34,210,8) r4 · (316,19,30,20) r8 score.
  - Block fill: `linear-gradient(90deg,#E3E7F0,#F1F3F8 50%,#E3E7F0)`. It is static in Figma; animate it as a shimmer.
- The text at (24,736,340) in Manrope SemiBold 11 `#5D6789`, "Squelettes pendant 12 s max, puis message d’erreur avec « Réessayer ».",
  is a **designer annotation (behaviour spec), not UI copy**. Behaviour: show skeletons for at most 12 s, then the S3 error.
- BottomNav light.

## 6. `21:476` S2 · État — avant la 1re édition  → `figma/21-476.png`

- Same band (226), status bar and GoMark as S1.
- "Classement final 2025-26" at (20,96): Changa ExtraBold 26 white, **not slanted**. The season is data.
- "LA SAISON 2026-27 A COMMENCÉ" at (18,136): IBM Plex Mono SemiBold 9 `#5DE39B`, tracking 0.9 (10%). The new season is data.
- Info card (16,250,358,120): white, radius 14, no shadow.
  - Title at (18,16,w320): Manrope ExtraBold 15 `#0B1330`, "Premier Top 10 de la saison après la journée 3".
  - Body at (18,58,w320): Manrope SemiBold 12 `#5D6789`, "Il faut au moins 3 journées pour classer les joueurs de façon juste. En attendant,
    voici le classement final 2025-26." ("3" is the minimum-matchday rule.)
- 5 compact rows: cards 358×52, white, radius 14, at y = 386 + 60·i.
  - Rank: Changa ExtraBold 18 `#1B2A6B` at (14,14).
  - Name: Manrope ExtraBold 13 `#0B1330` at (48,17).
  - Score: Changa ExtraBold 18 `#1B2A6B` at (316,14).
  - Rows: 1 Baba Bello Ilou 88 · 2 Abdelhamid Maali 86 · 3 Hakim Mesbahi 73 · 4 Enzo Mori 71 · 5 Mohamed El Arouch 70.
- The text at (24,700), "Libellé visible : « 2025-26 » — jamais présenté comme la semaine en cours.", is a **designer annotation**.
  The rule it states: always label the last season's table "2025-26" and never present it as the current week.
- BottomNav light.

## 7. `21:529` S3 · État — erreur  → `figma/21-529.png`

- Same band (226), status bar and GoMark. Nothing else is on the band.
- Card (16,300,358,190): white, **radius 16**, no shadow, content centred on x 179.
  - "Impossible de charger les pépites" at top 30: Manrope ExtraBold 17 `#0B1330`, centred, w320.
  - "Vérifiez votre connexion. Le classement est mis à jour chaque lundi à 20:00." at top 62: Manrope SemiBold 12 `#5D6789`, centred, w320.
  - Ink button "Réessayer" at (129,122,120,38): bg `#1B2A6B`, text white Manrope ExtraBold 13, radius 999.
- BottomNav light.

---
## 8. Components (`2:25`)  → screenshots `figma/3-12.png` (RatingChip), `3-264` (FilterChip), `3-271` (Button), `4-17` (ScoreRing), `4-18`
(Headshot), `4-48` (LeaderboardRow), `3-318` (BottomNav), `3-244` (Seg10Bar dark 10), `4-2` (ShirtFallback), `17-*` (AR)

- **RatingChip** `3:12`: 34×20, radius 5, px6, content centred. Text is Manrope ExtraBold 11 white with a comma decimal ("6,5").
  - Bands: r1 **<6 `#E5484D`**, r2 **6–6.5 `#F0A020`**, r3 **6.5–7 `#9BC53D`**, r4 **7–7.5 `#27B36B`**, r5 **≥7.5 `#1597B8`**.
  - Each lower bound is inclusive (7,0 is green and 6,5 is lime).
  - The Figma note says to always show the number, never colour alone.
- **FilterChip** `3:264`: h26, px11, radius 999, 1px border, label Manrope ExtraBold 11 ("Tous"), width hugs the label.
  - light off: bg #FFF, border `#E3E7F0`, text `#1B2A6B`
  - light on: bg and border `#1B2A6B`, text #FFF
  - dark off: bg rgba(255,255,255,.08), border rgba(255,255,255,.14), text #FFF
  - dark on: bg and border #FFF, text `#070D24`
- **Button** `3:271`: h38 (42 on the reveal), px18, radius 999, Manrope ExtraBold 13, default w120.
  - primary: vertical gradient `#7DF0AC→#8FE3F2`, text `#0D1F4A`
  - ink: `#1B2A6B`, text white
  - ghost-dark: rgba(255,255,255,.08) with a 1px inside border rgba(255,255,255,.2), text white
- **ScoreRing** `4:17` (light `4:7`, dark `4:12`), a 72×72 box:
  - Track: full ring, outer r 36, innerRadius ratio .84, so the ring is 5.76 thick (inner r 30.24).
    Light is `#E3E7F0`, dark is white @11%.
  - Value arc: the same ring with arcData start −90° and end −90° + 360°·score/100 (70 gives 162°). It runs **clockwise** with **flat ends**.
  - The arc fill is a **plain horizontal linear E across the 72px box** (x −1.76→70.24). It is **not** a conic gradient.
  - Score: Changa ExtraBold 26, centred, top 16, h28. Light `#1B2A6B`, dark white.
  - Label "RISING": IBM Plex Mono SemiBold 7, tracking 0.98 (14%), top 46. Light `#5D6789`, dark `#9AA4C7`.
  - Assets: `assets/comp-scorering-{track-light,track-dark,value-arc}.svg`.
- **Seg10Bar** `3:255`: 120×6 by default (flex:1 inside rows), 10 segments with flex 1, gap 2, radius 1.5.
  - Filled count = round(p/10). The colour is **fixed per index**: 1 `#5DE39B`, 2 `#65E0AE`, 3 `#6CDDC1`, 4 `#74DAD4`, 5 `#7BD7E7`,
    6 `#7FCAF0`, 7 `#7EB3F0`, 8 `#7D9BF0`, 9 `#7D84F0`, 10 `#7C6CF0`.
  - Empty segments are `#E3E7F0` (light) or rgba(255,255,255,.10) (dark).
  - Figma note: "In code segments are skewed −20°" (Figma draws them straight).
- **PercentileRow** `4:21`: 320×14 (330 inside cards), row, gap 8, centred.
  - Label w96: Manrope Bold 11 `#0B1330`.
  - Seg10Bar: flex 1.
  - Value w24: right-aligned IBM Plex Mono SemiBold 11 `#0B1330`.
- **Headshot / placeholder** `4:18`: 36 circle (radius 18).
  - Fill: `radial-gradient(circle 18px at 50% 80%, <club>, <club-dark>)`. HUSA is `#E63900→#661A00`. Behind a photo it is `#1E5BB8→#0D1433`.
  - Initials "BB": Changa ExtraBold 13 white, centred.
  - **Missing-photo dot** (9×9 at 26,26): a circle r 3.75 filled `#FFB020` with a 1.5px **white** stroke (`assets/comp-missing-photo-dot.svg`).
    Show it only when there is no licensed photo.
- **BottomNav (Pépites active)** `3:318`, 390×76:
  - Bar: flex with 5 equal items, pt8, pb22, border-top 1px `#E3E7F0` (light) or rgba(255,255,255,.08) (dark). bg #FFF or `#0A1130`.
  - Items are a column, gap 4, centred: icon, then label in Manrope Bold 10.
  - Order: Accueil · News · Fantasy · Matchs · **Pépites**.
  - Idle icon: a 20px disc, `#DFE3EE` (light) or white @12% (dark), with the label in `#7B84A3` / `#7E89AD`.
    The Figma file has no real glyphs for the idle icons.
  - **Pépites active icon: a 26px disc filled with E** (`linear-gradient(90deg,#5DE39B,#7FD6F0 45%,#7C6CF0)`), label `#1B2A6B` (light) or white
    (dark). Asset: `assets/comp-bottomnav-icon-pepites.svg`.
  - Figma note: "Approved 2026-09-26: Pépites replaces Profil; Profile moves to the header avatar."
- **LeaderboardRow** `4:48` (reference): 358×58, white, radius 14, `0 4px 12px rgba(11,19,48,.06)`, px12, py9, gap 10.
  - A 4px full-height club-colour edge on the left.
  - Rank: Changa ExtraBold 20 `#1B2A6B`, w22, centred.
  - Headshot 36.
  - Info column, gap 4:
    - Name: Manrope ExtraBold 13 `#0B1330`.
    - Meta: IBM Plex Mono Medium 9 `#5D6789`, e.g. "IRT · ATT · 20A · 1 275’ · 0B 8PD".
    - Seg10Bar at full width.
  - Score: Changa ExtraBold 22 `#1B2A6B`, with "RISING" below in IBM Plex Mono SemiBold 7 `#5D6789` (tracking 0.84), right-aligned.
- **ShirtFallback** `4:2`: 128×120, `drop-shadow 0 10px 8px rgba(0,0,0,.45)`.
  - Body path is filled with the club colour and has a 1px black stroke. The sleeves are white with a black stroke.
    Assets: `assets/comp-shirt-{body,sleeves}.svg`.
  - Surname: Changa ExtraBold 12 white, centred, top 34, w90.
  - Number: Changa ExtraBold 34 white, top 58. It shows the **Pépites rank**.
  - Kit colours come from `src/lib/kits.ts`.
- **GoMark / Pépites DATA** `3:272`, 104×22, row, gap 6:
  - Logo: 14×22 white, radius 6, "GO" in Manrope ExtraBold 9 `#1B2A6B`.
  - Wordmark "Pépites": Manrope ExtraBold 12 white.
  - "DATA" chip: bg E, radius 4, padding 3/5, IBM Plex Mono SemiBold 8 `#0B1330`, tracking 1.12 (14%).
- **FactsStrip** `4:35`: see §1.
- **StatusBar** (dark) `3:282`: see §1.

---
## 9. Arabic mobile (`2:27`) and share images (`2:29`)

**Brand text.** The Arabic sub-brand is **"جواهر"** (for "Pépites"). GoMark AR `17:295` is 90×25. Visual left→right it is the [DATA chip] then 6px, then
"جواهر" in Noto Sans Arabic Bold 12 white, then 6px, then the [GO logo]. The logo sits on the right, "DATA" stays Latin, and the mark is placed top-right (x 282).
Other Arabic terms:
- Rising Score → "مؤشر الصعود"; the ring label is "صعود" (Noto Sans Arabic Medium 7, no tracking)
- U23 → "أقل من 23"; Botola Pro → "البطولة الاحترافية"
- Percentiles → "النسب المئوية"; Percée → "الانطلاقة"
- Metrics: Note moyenne "متوسط التنقيط", Forme "المستوى", Contribution "المساهمة", Progression "التطور", Temps de jeu "وقت اللعب"
- Nav, right→left: الرئيسية · الأخبار · فانتازي · المباريات · **جواهر** (active, far left), Noto Sans Arabic SemiBold 10
- Digits stay Western (0-9) with a comma decimal. The season is wrapped in isolates "⁦2025-26⁩" (U+2066/U+2069).

**What mirrors (03 AR `18:709` → `figma/18-709.png`):**
- Mirrored:
  - The night band polygon becomes `(0,0)(390,0)(390,410)(0,386)`: the slant flips, low on the right (`assets/18-709-night-band-mirrored.svg`).
  - The glow moves to (140,60). The cutout moves to the right (206,84). The ScoreRing moves to the left (20,140).
  - "رقم 5 · أقل من 23" goes under the ring on the left (18,232), in Noto Sans Arabic SemiBold 11 `#5DE39B`.
  - Back link "الترتيب ›" moves top-right (320,54). The follow ghost button moves top-left (18,48) and reads "متابعة ＋ · 1284"
    (**the thousands space is dropped**).
  - The name "محمد العروش" is Changa ExtraBold **30**, right-aligned to x 370, and **not slanted**.
  - The meta is Noto Sans Arabic Medium 12 `#C9D2EA`: "اتحاد طنجة · مدافع · 22 سنة · القدم: " + "غير محددة" in `#FFB020`.
  - FactsStrip order is reversed: مباريات 17 is rightmost and تنقيط 6,60 leftmost. Labels are Noto Sans Arabic Medium 8 with no tracking.
  - Tabs are right-aligned with the active "نظرة عامة" rightmost (60-wide underline). "فانتازي ＋" moves left (16,410).
  - Card heads: title on the right (Noto Sans Arabic Bold 12) and subtitle on the left (Medium 10). FR used 11 ExtraBold caps.
  - PercentileRow RTL `17:268`: value on the left, **bar fills from the right**, label right-aligned in Noto Sans Arabic SemiBold 11.
    Example labels: "المستوى · 6 مباريات", "مقارنة مع 26 لاعبا أقل من 23 سنة".
  - The Percée row runs ×6,5 (left), then the 2nd-half bar, then the 1st-half bar (right).
- Not mirrored:
  - The ghost "05" is **not slanted** in AR 03 (plain, x −20) and the digits still read "05".
  - The **ScoreRing arc is not mirrored** (still clockwise; the SVG is identical).
  - The E gradient inside bars stays green→violet left→right.

**06 AR `26:392`** (`figma/26-392.png`):
- Story progress fills from the **right**.
- GoMark AR is top-right and "أفضل 10 · الاثنين 20:00" is top-left.
- The ghost "5" moves right and stays slanted.
- The underline gradient is mirrored (violet left → green right). The name is not slanted.
- Tiles, right→left: المؤشر 70 · النصف الثاني 1004’ · المستوى 6,72.
- The quote is wrapped in « ».
- Primary "متابعة ＋" moves right and ghost "التالي · رقم 4 ←" moves left.

**04 AR `25:343`** (`figma/25-343.png`):
- The table columns are reversed: date on the right, chip on the left.
  Tokens: D/E → "داخل"/"خارج", 1B → "1 هدف", 1PD → "1 تم", R → "24’ ب".
- The **trend chart is mirrored**: oldest on the right, newest on the left, and the line gradient flips with it.

**07 AR story `26:436`** (`figma/26-436.png`):
- The layout is mirrored. The name is 2 lines right-aligned to x 368: "محمد" white, then "العروش" in E.
  The **text gradient is still left→right** and the name is **not slanted**.
- The ghost "05" moves left and **stays slanted**.
- The **radial chart is flipped horizontally** (scaleX −1). Slice 0 (65) is top-left and the order runs counter-clockwise: 65, 77 (left), 90 (bottom), 62 (right), 50 (top-right).
- The legend reverses to label then swatch, starting with "وقت اللعب".
- The "70" is slanted, in E, and right-aligned (≈292–384). The text column is right-aligned to x 270, in Noto Sans Arabic 10.5.
- The URL stays Latin.

**Share images page `2:29`:**
- *Story 1080×1920* FR `29:284` and AR `29:335` are exactly the 390 story cards ×2.769.
- *Feed "post" 1080×1350 · Top 10 FR `29:386`* (`figma/29-386.png`, glows `assets/29-386-glow-*.svg`):
  - bg `#070D24`.
  - Glows: a 700 circle at (560,−300), `#7C6CF0` @35%, blur 160. A 600 circle at (−260,120), `#1597B8` @28%, blur 160.
  - Ghost "10": Changa ExtraBold 620, slanted, 3px stroke white @7%, origin (560,−120).
  - GoMark ×2.2 at (72,64): logo h48.4, GO 19.8, "Pépites" 26.4, DATA 17.6 with tracking 2.46, gap 13.2.
  - "U23 · BOTOLA PRO" at (760,72): IBM Plex Mono SemiBold 22 `#9AA4C7`, tracking 2.2.
  - "TOP 10": Changa ExtraBold 150 in E, slanted, origin (76,112).
  - "PÉPITES" at (84,272): Changa ExtraBold 64 white.
  - "CLASSEMENT FINAL 2025-26 · RISING SCORE" at (80,352): IBM Plex Mono SemiBold 22 `#5DE39B`, tracking 1.76.
  - List (72,420,936): 10 rows, 79px pitch, separated by 1px rgba(255,255,255,.08) lines.
    - Rank: Changa ExtraBold 40, slanted. Ranks 1–3 are E text and 4–10 are `#9AA4C7`.
    - Headshot: 56 circle at x 72. The gradient runs club colour → `#0A0D1F`, with initials in Changa 20.2. There is no missing dot.
    - Name at x 148: Manrope ExtraBold 28 white. Meta at +36: IBM Plex Mono Medium 17 `#9AA4C7`, tracking 0.68, e.g. "HASSANIA AGADIR · ATT".
    - A 10-segment bar of 17×20 blocks, radius 3, gap 5, at x 610. Filled = round(score/10). The colours differ slightly from Seg10Bar:
      `#5DE39B,#65E0B0,#6EDDC5,#76D9DA,#7FD6EF,#7EC2F0,#7EACF0,#7D97F0,#7D81F0,(#7C6CF0)`; empty is white @10%.
    - Score: Changa ExtraBold 48 in E, slanted, right-aligned to x 936.
  - Footer:
    - Rule (72,1232,936,1) white @14%.
    - "botolago.com/pepites" at (72,1262): IBM Plex Mono SemiBold 24 white.
    - "Note · forme · contribution · progression · temps de jeu": Manrope Bold 18 `#9AA4C7`, right-aligned to 1008.
- *Feed AR `29:581`* (`figma/29-581.png`) mirrors the feed FR:
  - The glows and the ghost "10" move to the left. GoMark AR is top-right.
  - Title "أفضل 10" is in E and upright. "جواهر" is white.
  - Rank on the right, headshot at x 808, name right-aligned to 788.
  - **The bars fill from the right.** The E-text score moves to the left.
  - Legend "التنقيط · المستوى · المساهمة · التطور · وقت اللعب".

**Also in the file (not specced here):**
- Mobile FR: 01 Accueil `6:2`, 02 Classement `10:276`, 05 Comparer `11:370`, and S4 "Invité — suivre un joueur (feuille de connexion)" `21:561`.
- Desktop · FR: D1 Classement `19:2` (1440×1317) and D2 Joueur `27:181` (1440×1898).
- Admin: A1 Sélection hebdo `20:2` (Top-10 ordering plus a required FR+AR sentence per player) and A2 Data desk `20:193` (photo licence form).
- An AR version exists for every mobile screen 01–07.
