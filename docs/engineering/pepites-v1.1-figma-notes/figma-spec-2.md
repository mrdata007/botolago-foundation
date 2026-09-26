# Figma spec, part 2: compare, guest follow, desktop (my notes)

Screens: 05 Comparer FR `11:370` (figma/11-370.png), AR `25:504`; S4 guest follow `21:561` (figma/21-561.png, FR only);
D1 desktop ranking `19:2` (figma/19-2.png, code figma/d1.min.tsx); D2 desktop player `27:181` (figma/27-181.png, code figma/d2.min.tsx).

## 05 Comparer (390, bg page)
- Night band polygon h326 (same family). Two glows 190 circles at (-30,70) and (230,70): each player's club colour.
- "‹ Retour" (18,56) Manrope XB 13 white. "FACE À FACE" centred at y60: Mono SB 9 #9aa4c7 tracking 1.26.
- Portraits: left photo 130 at (24,92) / right ShirtFallback 112×105 at (248,104). "VS" Changa XB 30 energy text, slanted, centre (~190,150).
- Names centred under each (w160, centres x89 and x302) at y228: Changa XB 15 white. Meta y250: Mono Medium 9 #9aa4c7 "IRT · 22 ANS · #5".
- Card (16,300,358): white r14 p14 gap10 shadow 0 6 16 rgba(11,19,48,.08).
  Head: "SAISON 2025-26" Manrope XB 11 tracking .66 #0b1330 · right "défenseurs U23" Mono Medium 9 #5d6789.
  Row (gap 6, centred): value w38 right (Mono SB 10) · bar box (max 88, h8, r2, right-aligned) · label w70 centred Manrope XB 9 #0b1330 · bar (left-aligned) · value w38 left.
  Winner: value #1b8f55, bar = energy gradient. Other: value #5d6789, bar #d5dae6. Bar width = 88 × v / max(v1,v2).
  CARTONS: fewer wins (1 vs 5: winner bar 17.6 gradient, loser 88 grey).
  Rows: RISING (score) · MINUTES · TITULAIRE (starts) · NOTE (avg rating) · FORME (form rating) · B + PD · CARTONS · PROGR. (progression percentile).
- Primary button full width h40 "Partager le face à face" at y541.
- AR: fully mirrored (our player on the right), labels المؤشر · الدقائق · أساسي · التنقيط · المستوى · أ + تم · البطاقات · التطور;
  header "وجها لوجه", back "رجوع", title "موسم ⁦2025-26⁩", subtitle "مدافعون أقل من 23", button "شارك المقارنة".

## S4 guest follow sheet
- Scrim rgba(5,9,20,.62). Sheet white, top radius 20, h330. Handle 40×4 #dfe3ee r2 at top 10.
- Headshot 56 (r28) centred at top 32. Title "Suivez Mohamed El Arouch" Manrope XB 18 #0b1330 centred at 100.
- Body Manrope SB 13 #5d6789 centred w330 at 132: "Créez un compte gratuit pour suivre ses matchs, recevoir le Top 10 du lundi et l’ajouter à votre équipe Fantasy."
- Primary "Créer un compte" h44 w350 at 210; ink "J’ai déjà un compte" h44 at 262.

## Follow button (03 hero)
- Ghost-dark h38 px18 r999: "＋ Suivre · 1 284" Manrope XB 13 white. AR "متابعة ＋ · 1284" (no thousands space).
- Reveal: primary "＋ Suivre" (w174 h42) next to ghost "Suivant · N°4 →".

## D1 desktop ranking (1440)
- App top bar white h64 (BotolaGO wordmark, nav centred, active underline energy 48×3, avatar).
- Night band h390, violet glow 420 at (-120,-40). Ghost "27" Changa 300 outline slanted at ~(393,60).
- GoMark (120,100). Title "Classement U23" Changa XB 56 white slanted (120,134).
- Meta (120,214) Mono Medium 11 #9aa4c7 tracking .88: "BOTOLA PRO · SAISON 2025-26 · 27 JOUEURS · 600+ MIN · MAJ LUN. 20:00".
- Lede (120,244) Manrope SB 15 #c9d2ea, 2 lines. "Comment on calcule →" (120,300) Manrope XB 14 #5de39b.
- Podium (706,100) gap16: 3 cards 190×250 r16, border 1 white/.14, bg linear 180° club@55% → #0d1738.
  Ghost rank Changa 64 outline top-left; shirt 110×103 at (39,39); name Changa XB 17 white (13,151); meta Mono Medium 9 #c9d2ea tracking .54 (13,177);
  score Changa XB 40 energy slanted (13,~200) + "RISING" Mono SB 8 #9aa4c7 tracking 1.12 at (69,221).
- Filters (120,470) gap 8: light chips Tous ATT MIL DEF GB ≤ 20 ans, "Club ▾", "Minutes min. ▾". Right (1161,476): "Trier par : Rising score ▾" Manrope Bold 13 #1b2a6b.
- Table card (120,516) w1200 white r16 px20 py8 shadow 0 8 24 rgba(11,19,48,.07).
  Header py12 border-b #eef1f6, Mono SB 10 tracking .8 #5d6789, gap 6: # w30 · JOUEUR w240 · POSTE w60 · ÂGE 50r · MJ 50r · TIT. 50r · MIN 62r · BUTS 50r · PD 40r · B+PD/90 70r · NOTE 62r · FORME 62r · 2DE MOITIÉ 80r · "RISING SCORE ▼" 164r (#1b2a6b).
  Row py9 border-b: rank Changa XB 16 #1b2a6b; headshot 36 + name Manrope XB 14 #0b1330 / club Manrope SB 12 #5d6789 (gap 12);
  poste pill bg #e8ecfb r4 px7 py3 Mono SB 10 #1b2a6b; numbers Manrope Bold 13 #0b1330; NOTE RatingChip; 2DE MOITIÉ "71 %"; score: Seg10 w100 + Changa XB 20 #1b2a6b (gap 10).
- Footer (120,~1273) Manrope SB 12 #5d6789: "Données : matchs Botola Pro 2025-26 … Pastille orange : photo manquante."

## D2 desktop player (1440)
- Night band h412 (from 64). Ghost "05" Changa 440 outline slanted at (607,-10).
- Breadcrumb (120,88) Manrope Bold 12 #9aa4c7 "Pépites  ›  Classement  ›  Mohamed El Arouch".
- Photo 290 at (112,112); energy stripe 250×6 slanted under it (131,404).
- GoMark (450,128). (450,166) Mono SB 11 #5de39b tracking .88 "N°5  ·  RISING SCORE  ·  U23".
- Name Changa XB 66 white slanted (450,180). Meta (450,274) Manrope Bold 15 #c9d2ea "Ittihad Tanger · Défenseur · 22 ans · #5 · Pied : " + "non renseigné" #ffb020.
- Actions (450,312) gap 10, 120×38: primary "＋ Suivre", ghost "⇄ Comparer", ghost "＋ Fantasy", ghost "Partager".
- ScoreRing 150 at (1170,112). Rank block centred under (1156,272): "N°5 sur 27" Manrope XB 16 white; "MAJ LUN. 20:00 · ÉDITION S1" Mono Medium 10 #9aa4c7 tracking .6.
- KPI strip (450,366) gap 12: tiles w150 px16 py12 r14 bg white/.06 border white/.14; value Changa XB 28 white; label Mono Medium 9 #9aa4c7 tracking .72.
  NOTE MOYENNE · MINUTES · MATCHS · TITULARISATIONS · BUTS + PD ("1 + 1").
- Tabs (120,496) gap 32 Manrope XB 15: active #1b2a6b + energy underline 56×3 (gap 6); idle #5d6789. Aperçu · Matchs · Stats · Comparer. Rule (120,526,1200) #dfe3ee.
- Left column (120,554) w776 gap 20; right column (920,554) w400 gap 20. Cards white r18 px24 py22 gap14 shadow 0 8 24 rgba(11,19,48,.07).
  Head: Mono SB 12 #0b1330 tracking .72 · right Mono Medium 11 #5d6789.
  * PERCENTILES · SAISON 2025-26 / "comparé aux 26 autres joueurs U23 classés". Rows gap 20: label col w230 (Manrope XB 14 #0b1330 + Manrope Bold 11 #5d6789 sub-line),
    Seg10 of 38×12 r3 blocks gap 4 (share colours), value Changa XB 26 #1b2a6b w44 right.
    Sub-lines: "6,60 sur la saison" · "6,72 sur les 6 derniers matchs" · "défenseur : clean sheets et note" · "155′ → 1 004′ entre les deux moitiés" · "1 159 minutes, 15 titularisations".
  * NOTE · 10 DERNIERS MATCHS / "moy. saison 6,60": chart 728×200, grid lines 6,0/7,0/8,0 #eef0f6, avg dashed, line + 14px dots, value labels above dots, dates below.
  * MATCHS · SAISON 2025-26 / "10 derniers sur 17": columns DATE · ADVERSAIRE · LIEU (Domicile/Extérieur) · SCORE · MIN ("24′ (entré)") · B / PD ("1 PD" #27b36b) · NOTE chip.
  * L'ÉCLOSION / "minutes par moitié": "×6,5" Changa XB 46 energy + "de temps de jeu en / seconde moitié de saison" Manrope Bold 12 #5d6789;
    two rows: label Manrope Bold 12 #5d6789 + value Mono SB 13 #0b1330, bar h12 r4 (1st #dfe3ee, 2nd energy), width ∝ minutes (max 352).
  * PROFIL / "source · date par champ": kv rows py6 border-t #eef0f6 13px; N.R. pill bg rgba(255,176,32,.16) r6 px8 py3 Mono SB 11 #a86400 "N.R. · non renseigné";
    link "Une donnée manquante ou fausse ? Signaler au data desk →" Manrope Bold 12 #1b2a6b.
  * FACE À FACE / "défenseurs U23": two scores Changa XB 34 #1b2a6b, names Manrope XB 13, meta Mono 10; VS energy 22; three rows MINUTES/NOTE/FORME (winner #27b36b);
    ink button full width h38 "Ouvrir le face à face →".
- Footer (120,1814) Manrope Bold 12 #5d6789 + "Comment on calcule →" #1b2a6b.
