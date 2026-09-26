# Home 6:2 and Ranking 10:276 (my notes)

Palette: page #f3f5fa; night #070d24; navy ink #1b2a6b; text #0b1330; muted #5d6789; meta-on-night #9aa4c7; sub-on-night #c9d2ea;
border #e3e7f0; row divider #eef1f6; nav idle text #7b84a3, idle icon #dfe3ee; energy gradient L→R #5de39b → #7fd6f0 (45%) → #7c6cf0.
Missing-photo dot: 9px circle #ffb020, 1.5px white ring, at bottom-right of headshot (left 26 top 26 for 36px).
Seg10 filled colours seg1..10: #5de39b #65e0ae #6cddc1 #74dad4 #7bd7e7 #7fcaf0 #7eb3f0 #7d9bf0 #7d84f0 (#7c6cf0 presumably 10); empty #e3e7f0; h6 gap2 radius1.5 (skew -20deg in code).
RatingChip: h20 w34 r5, Manrope ExtraBold 11 white; bands <6 red, 6–6.5 #f0a020, 6.5–7 #9bc53d, 7–7.5 green, >=7.5 blue.
Fonts: Changa ExtraBold (numbers, names, titles, skew -7.97deg on hero), Manrope ExtraBold/Bold, IBM Plex Mono Medium/SemiBold (meta, uppercase, tracking).

## Home (390x844)
- Night band polygon (0,0)(390,0)(390,352)(0,384) #070d24.
- club glow: circle d220 at (200,70), club colour opacity .75, blur 30. violet glow d150 at (-50,-40) #7c6cf0 .45 blur 30.
- ghost rank "01" Changa ExtraBold 230px, transparent fill (outline, stroke faint white) at x~175 y40 skewed.
- GoMark at (18,54): white 22h r6 box "GO" Manrope XB 9 #1b2a6b (px ~5); "Pépites" Manrope XB 12 white; DATA pill gradient px5 py3 r4, IBM Plex Mono SB 8 #0b1330 tracking 1.12. gap 6.
- Avatar (342,50) 30x30 r15 bg white/.12 border 1.5 white/.35, initials Manrope XB 10 white.
- (18,98) "U23 · BOTOLA PRO · 2025-26" Plex Mono SB 9 #9aa4c7 tracking 1.08.
- (18,138) "N°1 · RISING SCORE" Plex Mono SB 9 #5de39b tracking 1.08.
- (~18,~160) score "88" Changa XB 78 gradient text, skew -7.97.
- (~18,244) name "Baba Bello Ilou" Changa XB 26 white skew.
- (18,272) "HASSANIA AGADIR · ATT · 21 ANS" Plex Mono Medium 10 #c9d2ea tracking .6.
- Shirt fallback 128x120 at (242,128), drop-shadow 0 10 8 rgba(0,0,0,.45); surname Changa XB 12 white centered at top34; number Changa XB 34 at top58.
- FactsStrip (16,296) w358 h44, borders top/bottom white/.12; 4 equal cols py8 gap3: value Changa XB 18 white; label Plex Mono Medium 8 white/.7 tracking .8. BUTS / MINUTES / NOTE / B+PD/90.
- energy streak: 120x5 gradient bar at (-8,360) skewed.
- Filters (16,392) gap6: FilterChip h26 px11 r999 Manrope XB 11; on: bg #1b2a6b border #1b2a6b white; off: white bg border #e3e7f0 text #1b2a6b. Top 10, ATT, MIL, DEF, GB, ≤ 20 ans.
- Leaderboard (16,432) gap8: row w358 h58 px12 py9 gap10 r14 white shadow 0 4 12 rgba(11,19,48,.06); club edge 4px left full height; rank Changa XB 20 #1b2a6b w22 center; headshot 36 r18 (radial club→#0a0d1f, initials Changa XB 13 white, missing dot); info col gap4: name Manrope XB 13 #0b1330; meta Plex Mono Medium 9 #5d6789 "IRT · ATT · 20A · 1 275’ · 0B 8PD"; Seg10Bar full width; score col right: Changa XB 22 #1b2a6b, "RISING" Plex Mono SB 7 #5d6789 tracking .84.
- Bottom nav: white, border-top #e3e7f0, h76, pt8 pb22; items Manrope Bold 10 #7b84a3 icon 20; active Pépites icon 26 gradient circle, label #1b2a6b.

## Ranking (390x844)
- Night band polygon (0,0)(390,0)(390,214)(0,240) #070d24.
- ghost "27" (player count) Changa XB 150 outline at x~200 y30.
- GoMark (18,54). Title "Classement complet" Changa XB 30 white skew at (~18,~100).
- (18,134) "27 JOUEURS · U23 · 600+ MIN · TRI : RISING ▼" Plex Mono Medium 9 #9aa4c7 tracking .72.
- Filters (18,160) dark chips: on bg white border white text #070d24; off bg white/.08 border white/.14 text white. Tous, ATT, MIL, DEF, GB.
- Table card (12,224) white r14 px10 py4 shadow 0 6 16 rgba(11,19,48,.08).
  header row py7 border-b #eef1f6 Plex Mono SB 8 tracking .64 #5d6789: # (w18) JOUEUR (w150) MIN (w44 right) B/PD (w40 right) NOTE (w40 right) "SCORE ▼" (w40 right, #1b2a6b). gap4.
  rows py6 border-b #eef1f6 gap4: rank Plex Mono Medium 10 #5d6789 w18; player w150 gap6: headshot 20 (initials Changa XB 7) + name "B. Bello Ilou" Manrope Bold 11 #0b1330; MIN Manrope Bold 11 right; B/PD "16/1"; NOTE RatingChip; SCORE Changa XB 14 #1b2a6b right.
