/* S05 · S06 · S07 — M2 `card_created` and M3 formation (ONBOARDING_PLAN.md sections 3, 4, 7).
   S05  The team page with the M2 panel: new (serial null), new (serial set), arrival (forming).
   S06  The hub block (M3a, M3b): forming 1/3, eve, round over but not final, 3/3 waiting for a
        stat, late signer.
   S07  The rankings "my position" line with the 44px token (M3c), the private recap line (M3d),
        the three one-line hints at the decision (M3e) and the first-transfer line (M3f).
   Every screen mocks the real BotolaGO page it sits in (labels from the app's dictionaries, bars
   where the app shows a figure or a name). The card adds one inline block to it. Nothing opens by
   itself: the two sheets/bars shown are the state after a tap. Motion (motion=1 only, nothing
   under prefers-reduced-motion): the M2 panel rises 8px (the app's enter-rise, transform only so
   nothing is ever invisible) while the card plays its own `make` beat; a counted round arrives as
   the direction's `tick` beat on the hub token, and the counter's digit changes (k-1 to k) at the
   instant that beat's stripe is finished. Nothing else on either screen moves. */
(function () {
  const MC = window.MC;
  const ONB = MC.ONB;
  if (!ONB || !ONB.screen) return;
  const K = "card.onboarding.";
  const bar = ONB.skeleton.bar;

  /* The app's own words that the shared kit does not carry yet, copied from
     src/i18n/dictionary-fr.ts and dictionary-ar.ts (the key it comes from is noted). */
  ONB.addStrings({
    fr: {
      "app.view.pitch": "Terrain" /* fantasy.view.pitch */,
      "app.view.list": "Liste" /* fpl.list */,
      "app.view.toggle": "Mode d'affichage" /* fantasy.view.toggle_label */,
      "app.chip.bench_boost": "Bench Boost",
      "app.chip.free_hit": "Free Hit",
      "app.chip.triple_captain": "Triple Capitaine",
      "app.chip.play": "JOUER" /* fpl.state.play */,
      "app.chip.about": "À propos de {chip}" /* fantasy.chip.info */,
      "app.club_limit": "{n} max / club" /* fantasy.team.chip_club_limit */,
      "app.make_captain": "Nommer capitaine" /* fpl.make_captain */,
      "app.make_vice": "Nommer vice-capitaine" /* fpl.make_vice */,
      "app.substitute": "Remplacer" /* fpl.substitute */,
      "app.player_info": "Informations joueur" /* fpl.player_info */,
      "app.cancel": "Annuler" /* fpl.cancel */,
      "app.cost": "Coût" /* fpl.cost */,
      "app.add_player": "Ajouter un joueur" /* fpl.add_player */,
      "app.next": "Suivant" /* fpl.next */,
      "app.transfer.about_one":
        "Vous allez effectuer 1 transfert !" /* fpl.about_to_transfer_one */,
      "app.transfer.out": "Sortant" /* fpl.transfer_out */,
      "app.transfer.in": "Entrant" /* fpl.transfer_in */,
      "app.transfer.active_note":
        "Les transferts seront actifs pour la Journée {gw} s’ils sont effectués avant la date limite." /* fpl.transfers_active_note */,
      "app.transfer.overview": "Aperçu des points" /* fpl.points_overview */,
      "app.transfer.free_used": "Transferts gratuits utilisés" /* fpl.free_transfers_used */,
      "app.transfer.paid_used": "Transferts supplémentaires" /* fpl.additional_transfers_used */,
      "app.transfer.left_in_bank": "Reste en banque" /* fpl.left_in_bank */,
      "app.edit_transfers": "Modifier" /* fpl.edit_transfers */,
      "app.confirm": "Confirmer" /* fpl.confirm */,
      "app.rankings.tab": "Classement" /* fantasy.tab.rankings */,
      "app.rankings.sort_overall": "Général",
      "app.rankings.sort_gameweek": "Journée",
      "app.rankings.tab_leagues": "Mes ligues",
      "app.rankings.search": "Rechercher un manager ou une équipe",
      "app.rankings.manager": "Manager",
      "app.rankings.gw": "J." /* fantasy.leagues.gw */,
      "app.rankings.total": "Total" /* fantasy.leagues.total */,
      "app.rankings.jump": "Aller à ma position" /* fantasy.rankings.jump_to_me */,
      "app.recap.title": "Ma journée BotolaGO" /* fantasy.recap.title */,
      "app.recap.gameweek": "Journée {n}",
      "app.recap.final": "Résultat final",
      "app.recap.detail": "Voir le détail",
      "app.recap.share": "Partager ma journée",
      "app.points.unit": "pts" /* fantasy.points.unit_other */,
    },
    ar: {
      "app.view.pitch": "الملعب",
      "app.view.list": "القائمة",
      "app.view.toggle": "طريقة العرض",
      "app.chip.bench_boost": "تعزيز الاحتياط",
      "app.chip.free_hit": "الضربة الحرة",
      "app.chip.triple_captain": "القائد الثلاثي",
      "app.chip.play": "تفعيل",
      "app.chip.about": "معلومات عن {chip}",
      "app.club_limit": "{n} كحد أقصى / ناد",
      "app.make_captain": "تعيين قائدًا",
      "app.make_vice": "تعيين نائبًا للقائد",
      "app.substitute": "تبديل",
      "app.player_info": "معلومات اللاعب",
      "app.cancel": "إلغاء",
      "app.cost": "التكلفة",
      "app.add_player": "إضافة لاعب",
      "app.next": "التالي",
      "app.transfer.about_one": "أنت على وشك إجراء انتقال واحد!",
      "app.transfer.out": "خارج",
      "app.transfer.in": "داخل",
      "app.transfer.active_note": "ستُفعَّل الانتقالات للجولة {gw} إذا تمت قبل الموعد النهائي.",
      "app.transfer.overview": "ملخص النقاط",
      "app.transfer.free_used": "الانتقالات المجانية المستخدمة",
      "app.transfer.paid_used": "الانتقالات الإضافية",
      "app.transfer.left_in_bank": "المتبقي في الرصيد",
      "app.edit_transfers": "تعديل",
      "app.confirm": "تأكيد",
      "app.rankings.tab": "الترتيب",
      "app.rankings.sort_overall": "عام",
      "app.rankings.sort_gameweek": "الجولة",
      "app.rankings.tab_leagues": "دورياتي",
      "app.rankings.search": "ابحث عن مدرب أو فريق",
      "app.rankings.manager": "المدرب",
      "app.rankings.gw": "ج.",
      "app.rankings.total": "المجموع",
      "app.rankings.jump": "انتقل إلى ترتيبي",
      "app.recap.title": "جولتي",
      "app.recap.gameweek": "الجولة {n}",
      "app.recap.final": "النتيجة النهائية",
      "app.recap.detail": "عرض التفاصيل",
      "app.recap.share": "مشاركة جولتي",
      "app.points.unit": "ن",
    },
  });

  /* ---------- style: every rule under .onb and an m23- class ---------- */
  ONB.style(
    "m23",
    `
.onb .m23-flush { margin-block: -14px -24px; }
.onb .m23-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.onb .m23-gut { padding-inline: var(--ui-gutter); }

/* the inner-screen header (UiHeader): back pill, kicker over the title */
.onb .m23-header__mid { min-width: 0; text-align: center; }
.onb .m23-header__mid > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.onb .m23-header__extra { margin-block-start: 8px; }

/* FplStatBar: the navy summary strip */
.onb .m23-strip { --m23-muted: color-mix(in srgb, var(--ui-on-ink-plain) 78%, var(--ui-ink)); padding: 12px var(--ui-gutter); background: var(--ui-ink); color: var(--ui-on-ink-plain); box-shadow: inset 0 0 0 1px var(--ui-ink-edge); }
.onb .m23-strip__cols { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); grid-template-rows: repeat(var(--r, 2), auto); row-gap: 2px; }
.onb .m23-strip__col { display: grid; grid-row: span var(--r, 2); grid-template-rows: subgrid; min-width: 0; padding-inline-end: 8px; }
.onb .m23-strip__col + .m23-strip__col { padding-inline: 14px 8px; border-inline-start: 1px solid color-mix(in srgb, var(--ui-on-ink-plain) 16%, transparent); }
.onb .m23-strip__label { align-self: end; color: var(--m23-muted); font: 800 12px/var(--ui-leading-flat) var(--onb-body); text-wrap: balance; }
.onb .m23-strip__val { align-self: center; font: 800 14px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-strip__val .onb-sk { margin-block: 4px; }
.onb .m23-strip__sub { display: flex; align-items: center; gap: 4px; font: 800 13px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-strip .onb-sk { background: color-mix(in srgb, var(--ui-on-ink-plain) 32%, transparent); }
.onb .m23-strip__foot { margin-block-start: 8px; padding-block-start: 8px; border-block-start: 1px solid color-mix(in srgb, var(--ui-on-ink-plain) 16%, transparent); color: var(--m23-muted); font: 600 13px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-strip__foot strong { color: var(--ui-on-ink-plain); font-weight: 800; }

/* the team page's facts, chips and Terrain | Liste toggle */
.onb .m23-facts { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px var(--ui-gutter) 0; }
.onb .m23-fact { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--ui-surface-sunken); font: 800 13px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-chips { display: flex; flex-wrap: wrap; gap: 12px 6px; max-height: 64px; padding-block: 16px 4px; padding-inline: var(--ui-gutter) 0; overflow: hidden; }
.onb .m23-chip { flex: none; display: inline-flex; align-items: center; gap: 0; min-height: 44px; padding-inline: 14px 6px; border-radius: 999px; background: var(--ui-surface); box-shadow: var(--ui-card-shadow); }
.onb .m23-chip__name { white-space: nowrap; font: 800 13px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-chip__hit { display: inline-grid; place-items: center; width: 44px; min-height: 44px; margin-inline: -10px; color: var(--ui-on-surface-muted); }
.onb .m23-chip__state { display: inline-grid; place-items: center; min-width: 44px; min-height: 44px; margin-inline-start: 2px; }
.onb .m23-chip__state > span { display: inline-flex; align-items: center; min-height: 32px; padding-inline: 12px; border-radius: 999px; background: var(--ui-surface-sunken); font: 800 12px/var(--ui-leading-flat) var(--onb-body); white-space: nowrap; }
.onb .m23-seg { display: grid; grid-template-columns: 1fr 1fr; margin: 12px var(--ui-gutter) 0; padding: 3px; border-radius: 999px; background: var(--ui-surface); box-shadow: var(--ui-card-shadow); }
.onb .m23-seg button { min-height: 44px; padding-inline: 8px; border-radius: 999px; color: var(--ui-on-surface-muted); font: 800 13px/1.2 var(--onb-body); text-align: center; }
.onb .m23-seg button[aria-selected="true"] { background: var(--ui-selected); color: var(--ui-on-selected); }
.onb .m23-pitch { margin: 12px var(--ui-gutter) 0; border-radius: var(--ui-radius-sheet); overflow: hidden; background: var(--ui-surface-sunken); box-shadow: var(--ui-card-shadow); }
.onb .m23-pitch { --m23-line: color-mix(in srgb, oklch(1 0 0) 58%, transparent); }
.onb .m23-pitch .onb-turf { border-radius: 0; }
.onb .m23-pitch .onb-turf__rows { position: relative; inset: auto; justify-content: flex-start; gap: 12px; padding-block: 12px 16px; padding-inline: calc(3.3% + 6px); }
.onb .m23-pitch .onb-plate__shirt { height: 40px; }
.onb .m23-markings { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.onb .m23-bench { display: flex; justify-content: space-evenly; padding: 10px 8px 12px; }
.onb .m23-plate--sel { outline: 3px solid var(--ui-ink-fg); outline-offset: 2px; }

/* the sticky docks (substitute bar, transfers dock) */
.onb .m23-dock { position: sticky; bottom: 0; z-index: 3; margin-block-start: 16px; padding: 10px var(--ui-gutter); background: var(--ui-surface); border-block-start: 1px solid var(--ui-rule); box-shadow: var(--ui-shadow-raised); }
.onb .m23-dock--float { margin-block-start: 0; padding: 10px var(--ui-gutter); background: var(--ui-page); border: 0; box-shadow: 0 -6px 14px -8px color-mix(in oklab, var(--ui-ink) 30%, transparent); display: flex; flex-direction: column; gap: 8px; }
.onb .m23-dock--float .onb-btn--ink { box-shadow: var(--ui-shadow-lifted); }
.onb .m23-dock__row { display: grid; grid-template-columns: 3fr 2fr; gap: 8px; }
.onb .m23-dock__row--even { grid-template-columns: 1fr 1fr; }

/* M2: the panel */
.onb .m23-panel { margin: 8px var(--ui-gutter) 0; padding-block: 10px 12px; padding-inline: 14px; }
.onb .m23-panel__body { display: flow-root; }
.onb .m23-panel__card { float: inline-start; width: 128px; margin-inline-end: 14px; }
.onb .m23-panel__top { min-height: 44px; margin-block-start: -8px; align-items: flex-start; }
.onb .m23-panel__top .onb-hero__label { padding-block-start: 8px; line-height: 1.2; text-wrap: balance; }
.onb .m23-panel__body > .m23-line { margin-block-start: 4px; }
/* What the card is for (the rules) reads quiet; what is yours (the serial, the invitation) reads in ink. */
.onb .m23-line { color: var(--ui-on-surface-muted); font: 600 13px/1.45 var(--onb-body); }
.onb[dir="rtl"] .m23-line { line-height: 1.8; }
.onb .m23-line--serial { color: var(--ui-on-surface); font: 800 14px/1.4 var(--onb-body); }
.onb[dir="rtl"] .m23-line--serial { line-height: 1.75; }
.onb .m23-invite { margin-block: 6px 8px; color: var(--ui-on-surface); font: 700 13px/var(--ui-leading-copy) var(--onb-body); text-wrap: pretty; }
.onb .m23-panel__body + .onb-btn, .onb .m23-invite + .onb-btn { margin-block-start: 0; }
.onb .m23-panel__body + .onb-btn { margin-block-start: 10px; }

/* M3a: the hub block */
.onb .m23-hub { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 112px; padding-block: 14px; padding-inline: 16px 8px; text-align: start; }
.onb .m23-hub__txt { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.onb .m23-hub__top { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 10px; }
.onb .m23-counter { position: relative; display: inline-block; font: 800 40px/var(--ui-leading-figure) var(--onb-display); }
.onb .m23-cnt { display: inline-block; }
.onb .m23-cnt--was { display: none; position: absolute; inset-block-start: 0; inset-inline-start: 0; }
.onb .m23-hub__late { display: flex; flex-direction: column; gap: 2px; }
.onb .m23-hub__line { color: var(--ui-on-surface-muted); font: 600 13px/var(--ui-leading-copy) var(--onb-body); text-wrap: pretty; }
.onb .m23-hub__go { flex: none; color: var(--ui-on-surface-muted); }

/* M3c: the rankings tabs, the position line, the table */
.onb .m23-tabs { display: flex; padding-inline: 8px; background: var(--ui-surface); border-block-end: 1px solid var(--ui-rule); }
.onb .m23-tab { position: relative; flex: 1 1 0; display: grid; place-items: center; min-height: 48px; color: var(--ui-on-surface-muted); font: 600 16px/1.25 var(--onb-display); }
.onb .m23-tab[aria-selected="true"] { color: var(--ui-on-surface); font-weight: 800; }
.onb .m23-tab[aria-selected="true"]::after { content: ""; position: absolute; inset-inline: 12px; bottom: 0; height: 4px; border-radius: 4px 4px 0 0; background: var(--ui-ink-fg); }
.onb .m23-rank { display: grid; gap: 20px; padding: 24px var(--ui-gutter) 24px; }
.onb .m23-pos { display: flex; gap: 12px; }
.onb .m23-pos__edge { flex: none; width: 4px; align-self: stretch; border-radius: 999px; background-image: var(--ui-grad-action); }
.onb .m23-pos__main { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding-block: 4px; }
.onb .m23-pos__sec { display: flex; align-items: center; gap: 6px; font: 600 14px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-inl { display: inline-flex; align-items: center; gap: 4px; line-height: 1; }
.onb .m23-pos__trail { flex: none; display: flex; align-items: center; gap: 4px; align-self: center; }
.onb .m23-pos__card { display: flex; align-items: center; gap: 6px; min-height: 48px; padding-inline: 4px 8px; border-radius: 999px; }
.onb .m23-pos__k { font: 800 15px/var(--ui-leading-flat) var(--onb-body); }
.onb .m23-search { display: flex; align-items: center; gap: 8px; min-height: 48px; padding-inline: 14px; border-radius: 999px; background: var(--ui-surface); box-shadow: var(--ui-card-shadow); color: var(--ui-on-surface-muted); }
.onb .m23-search input { flex: 1 1 0; min-width: 0; min-height: 44px; border: 0; outline: 0; background: transparent; color: var(--ui-on-surface); font: 600 14px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-search input::placeholder { color: var(--ui-on-surface-muted); opacity: 1; }
.onb .m23-table { width: 100%; border-collapse: collapse; background: var(--ui-surface); border-radius: var(--ui-radius-card); box-shadow: var(--ui-card-shadow); overflow: hidden; }
.onb .m23-table th { padding: 10px 6px; color: var(--ui-on-surface-muted); font: 800 12px/var(--ui-leading-flat) var(--onb-body); text-align: start; border-block-end: 1px solid var(--ui-rule); }
.onb .m23-table td { padding: 8px 6px; border-block-end: 1px solid var(--ui-rule); vertical-align: middle; }
.onb .m23-table tr:last-child td { border-block-end: 0; }
.onb .m23-table th:first-child, .onb .m23-table td:first-child { padding-inline-start: 16px; width: 44px; }
.onb .m23-table th:last-child, .onb .m23-table td:last-child { padding-inline-end: 16px; }
.onb .m23-table .m23-n { text-align: end; }
.onb .m23-table td .onb-sk + .onb-sk { margin-block-start: 5px; }
.onb .m23-rankno { color: var(--ui-on-surface-muted); font: 800 16px/1.2 var(--onb-body); font-variant-numeric: tabular-nums; }

/* M3d: the recap card */
.onb .m23-recap { margin: 12px var(--ui-gutter) 0; padding: 16px; }
.onb .m23-recap__head { display: flex; align-items: flex-start; gap: 12px; }
.onb .m23-recap__head > div:first-child { flex: 1 1 0; min-width: 0; }
.onb .m23-recap__total { display: flex; align-items: baseline; gap: 6px; margin-block-start: 12px; }
.onb .m23-recap__card { margin-block-start: 8px; font: 700 14px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-recap__lines { display: grid; gap: 8px; margin-block-start: 12px; }
.onb .m23-recap__foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-block-start: 12px; }
.onb .m23-underline { text-decoration: underline; text-underline-offset: 4px; }
.onb .m23-hdr-sel { display: flex; align-items: center; gap: 4px; padding: 4px; border-radius: 999px; background: var(--ui-surface); box-shadow: var(--ui-card-shadow); }
.onb .m23-hdr-sel__mid { flex: 1 1 0; display: flex; align-items: baseline; justify-content: center; gap: 6px; min-width: 0; }

/* M3e: the action sheet, the transfer confirmation */
.onb .m23-sheet { max-height: 100%; }
.onb .m23-sheet__head { display: flex; align-items: center; gap: 12px; padding: 20px 16px 16px; background: var(--ui-ink); color: var(--ui-on-ink-plain); box-shadow: inset 0 0 0 1px var(--ui-ink-edge); }
.onb .m23-sheet__shirt { flex: none; display: grid; place-items: center; width: 56px; height: 56px; border-radius: 999px; background: var(--ui-on-ink-plain); color: var(--ui-ink); box-shadow: var(--ui-shadow-lifted); }
.onb .m23-sheet__who { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.onb .m23-sheet .m23-glass { background: color-mix(in srgb, var(--ui-on-ink-plain) 16%, transparent); color: var(--ui-on-ink-plain); }
.onb .m23-sheet .onb-sk { background: color-mix(in srgb, var(--ui-on-ink-plain) 34%, transparent); }
.onb .m23-sheet__hint { padding: 12px 16px 4px; }
.onb .m23-sheet__row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 4px 16px; border-block-end: 1px solid var(--ui-rule); font: 800 15px/var(--ui-leading-copy) var(--onb-body); text-align: start; }
.onb .m23-sheet__row:last-child { border-block-end: 0; }
.onb .m23-sheet__body { padding-block-end: max(8px, env(safe-area-inset-bottom)); }
.onb .m23-pair { display: flex; align-items: stretch; }
.onb .m23-pair__edge { flex: none; width: 4px; }
.onb .m23-pair__in { display: flex; flex: 1 1 0; align-items: center; gap: 12px; min-width: 0; padding-block: 10px; padding-inline: 12px 16px; }
.onb .m23-pair__lbl { flex: none; width: 76px; font: 800 12px/var(--ui-leading-flat) var(--onb-body); }
.onb .m23-pair__disc { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 999px; background: var(--ui-surface-sunken); color: var(--ui-ink-fg); }
.onb .m23-kv { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; border-block-end: 1px solid var(--ui-rule); }
.onb .m23-kv:last-child { border-block-end: 0; }
.onb .m23-band { padding: 12px var(--ui-gutter); background: var(--ui-ink); color: var(--ui-on-ink-plain); box-shadow: inset 0 0 0 1px var(--ui-ink-edge); }
.onb .m23-band__title { font: 800 19px/var(--ui-leading-display) var(--onb-display); text-wrap: balance; }
.onb .m23-band__sub { margin-block-start: 4px; color: color-mix(in srgb, var(--ui-on-ink-plain) 78%, var(--ui-ink)); font: 600 13px/var(--ui-leading-copy) var(--onb-body); }
.onb .m23-band__sub strong { color: var(--ui-on-ink-plain); font-weight: 800; }

/* motion: the panel rises 8px (the app's enter-rise, transform only) while the card plays its own
   beat; on the hub block the counter shows the old digit until the tick beat's stripe is done, then
   the new one (a swap of two visibilities on that beat's own length: no scale, no slide, no fade).
   Never the number, the name or the serial. */
@media (prefers-reduced-motion: no-preference) {
  .onb .m23-panel--motion { animation: m23-rise 280ms cubic-bezier(0, 0, 0.2, 1) both; }
  .onb .m23-hub--tick .m23-cnt { animation: m23-after var(--m23-tick) steps(1, end) both; }
  .onb .m23-hub--tick .m23-cnt--was { display: block; animation-name: m23-before; }
}
@keyframes m23-rise { from { transform: translateY(8px); } to { transform: none; } }
@keyframes m23-after { from { visibility: hidden; } to { visibility: visible; } }
@keyframes m23-before { from { visibility: visible; } to { visibility: hidden; } }
`,
  );

  /* ---------- small helpers ---------- */
  const PATHS = {
    shield:
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    "shield-half":
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 22V2"/>',
    target:
      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    share:
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
    "chev-l": '<path d="m15 18-6-6 6-6"/>',
    "chev-r": '<path d="m9 18 6-6-6-6"/>',
  };
  /** The app's lucide icons the shared kit does not draw; the kit's own go through ONB.icon. */
  const ico = (name, { size = 20, dir = false } = {}) =>
    PATHS[name]
      ? `<svg class="onb-ico${dir ? " onb-ico--dir" : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`
      : ONB.icon(name, { size });
  const ibtn = (name, label, cls = "") =>
    `<button type="button" class="onb-iconbtn${cls ? " " + cls : ""}" aria-label="${label}">${ico(name)}</button>`;
  const gwOf = (env) => env.ctx.nextGw ?? env.ctx.firstGw ?? 5;

  /** UiHeader: Back, the screen's kicker over its title, a trailing slot, optional child row. */
  const appHeader = (env, { kicker, title, label = "", trailing = "", extra = "" }) =>
    `<header class="onb-header"><div class="onb-header__row">` +
    `<div><button type="button" class="onb-backpill">${ONB.icon("back")}<span>${env.t("app.back")}</span></button></div>` +
    `<div class="m23-header__mid">${kicker ? `<p class="onb-t-label onb-muted">${kicker}</p>` : ""}<h1 class="onb-t-header"${label ? ` aria-label="${label}"` : ""}>${title}</h1></div>` +
    `<div class="onb-header__end">${trailing}</div></div>${extra ? `<div class="m23-header__extra">${extra}</div>` : ""}</header>`;

  /** FplStatBar: columns of label / figure / sub-line, then an optional footer line. */
  const strip = (cols, foot = "") =>
    `<div class="m23-strip"><div class="m23-strip__cols" style="--r:${cols.some((c) => c.sub) ? 3 : 2}">${cols
      .map(
        (c) =>
          `<div class="m23-strip__col"><span class="m23-strip__label">${c.label}</span><span class="m23-strip__val">${c.value}</span>${c.sub ? `<span class="m23-strip__sub">${c.sub}</span>` : ""}</div>`,
      )
      .join("")}</div>${foot ? `<div class="m23-strip__foot">${foot}</div>` : ""}</div>`;

  const deadlineText = (env) => `<bdi>${ONB.iso(env.pick(env.ctx.deadline) || "", env)}</bdi>`;
  /** "Journée 6 · Date limite : sam. 16:30" (French sets a space before a colon). */
  const deadlineLine = (env, gw) =>
    `${env.t("app.gameweek")} ${env.num(gw)} · ${env.t("app.deadline")}${env.ar ? ":" : " :"} <strong>${deadlineText(env)}</strong>`;

  /** The team page's strip: the deadline, with the time left as a bar. */
  const teamStrip = (env) =>
    strip([
      {
        label: env.t("app.deadline"),
        value: deadlineText(env),
        sub: `${ico("clock", { size: 14 })}${bar(78, 12)}`,
      },
    ]);

  const facts = (env) =>
    `<ul class="m23-facts" aria-label="${env.text("app.pick_team")}">` +
    `<li class="m23-fact"><bdi>4-4-2</bdi></li>` +
    `<li class="m23-fact">${env.t("app.bank")} ${bar(26, 11)}</li>` +
    `<li class="m23-fact">${env.t("app.club_limit", { n: 3 })} ✓</li></ul>`;

  const chipsRow = (env) => {
    const chip = (key) =>
      `<div class="m23-chip"><span class="m23-chip__name">${env.t("app.chip." + key)}</span>` +
      `<button type="button" class="m23-chip__hit" aria-label="${env.text("app.chip.about", { chip: env.text("app.chip." + key) })}">${ONB.icon("info", { size: 18 })}</button>` +
      `<button type="button" class="m23-chip__state" aria-label="${env.text("app.chip." + key)}: ${env.text("app.chip.play")}"><span>${env.t("app.chip.play")}</span></button></div>`;
    return `<div class="m23-chips">${["bench_boost", "free_hit", "triple_captain"].map(chip).join("")}</div>`;
  };

  const toggle = (env) =>
    `<div class="m23-seg" role="tablist" aria-label="${env.text("app.view.toggle")}">` +
    `<button type="button" role="tab" aria-selected="true">${env.t("app.view.pitch")}</button>` +
    `<button type="button" role="tab" aria-selected="false">${env.t("app.view.list")}</button></div>`;

  const plate = (sel) =>
    `<span class="onb-plate${sel ? " m23-plate--sel" : ""}"><span class="onb-plate__shirt"><i></i></span><span class="onb-plate__name"></span><span class="onb-plate__fig"></span></span>`;
  /** The pitch card: turf with a row of plates per line, and the bench strip. `sel` is a plate index. */
  const markings =
    '<svg class="m23-markings" aria-hidden="true" viewBox="0 0 100 150" preserveAspectRatio="none"><g fill="none" stroke="var(--m23-line)" stroke-width="0.6"><rect x="3" y="0" width="94" height="150"/><rect x="20" y="0" width="60" height="20"/><rect x="35" y="0" width="30" height="7"/><path d="M 38 20 A 12 12 0 0 0 62 20"/><circle cx="50" cy="150" r="14"/></g></svg>';
  const pitch = ({ rows = [1, 4, 4, 2], sel = -1, bench = true } = {}) => {
    let i = 0;
    const line = (n) =>
      `<div class="onb-turf__line">${Array.from({ length: n }, () => plate(i++ === sel)).join("")}</div>`;
    return (
      `<div class="m23-pitch" aria-hidden="true"><div class="onb-turf">${markings}<div class="onb-turf__rows">${rows.map(line).join("")}</div></div>` +
      (bench
        ? `<div class="m23-bench">${Array.from({ length: 4 }, () => plate(false)).join("")}</div>`
        : "") +
      `</div>`
    );
  };

  /** The whole team page below its header: strip, [panel], facts, chips, toggle, pitch. */
  const teamPage = (env, { panel = "", sel = -1, dock = "" } = {}) =>
    appHeader(env, {
      kicker: `${env.t("app.gameweek")} ${env.num(gwOf(env))}`,
      title: env.t("app.pick_team"),
    }) +
    teamStrip(env) +
    panel +
    facts(env) +
    chipsRow(env) +
    toggle(env) +
    pitch({ sel }) +
    dock;

  const motionOn = (env) => !!env.o.motion;

  /* ================= S05 · M2: the team page with the panel ================= */
  const panelHtml = (env, arrival) => {
    const id = MC.uid("m23-h");
    const motion = motionOn(env);
    const line = (html) => `<p class="m23-line">${html}</p>`;
    // The rules (when the note arrives, what it measures) are quiet lines; the serial, when there is
    // one, is the first thing under the heading and reads in ink; the invitation leads into its button.
    const serial = env.p.serial
      ? `<p class="m23-line m23-line--serial">${env.t(K + "m2.serial")}</p>`
      : "";
    const rules = arrival
      ? line(env.t(K + "m2.arrival", { k: env.p.counted }))
      : line(env.t(K + "m2.line1")) + line(env.t(K + "m2.line2"));
    // The invite line only while the first counted round's deadline is ahead (nothing counted yet).
    const invite =
      !arrival && !env.p.counted
        ? `<p class="m23-invite">${env.t(K + "m2.invite", { gw: env.ctx.firstGw ?? gwOf(env) })}</p>`
        : "";
    return (
      `<section class="onb-panel onb-hero m23-panel${motion ? " m23-panel--motion" : ""}" aria-labelledby="${id}">` +
      `<div class="m23-panel__body"><div class="m23-panel__card">${env.card("full", { width: 128, beat: "make" })}</div>` +
      `<div class="onb-hero__top m23-panel__top"><h3 id="${id}" class="onb-t-sub onb-hero__label">${env.t(K + "m2.heading")}</h3>${ONB.closeButton(env, env.text(K + "common.close"))}</div>` +
      serial +
      rules +
      `</div>` +
      invite +
      ONB.button(env.t(K + "m2.invite_button"), { kind: "soft", full: true }) +
      `</section>`
    );
  };

  ONB.screen({
    id: "S05",
    moment: "M2",
    title: "Team page with the card's birth panel",
    variants: [
      { key: "new", fixture: "born0", label: "New: squad just saved, serial not assigned" },
      {
        key: "new-serial",
        fixture: "born0Serial",
        label: "New: serial assigned, the serial line shows",
      },
      {
        key: "arrival",
        fixture: "forming1",
        label: "Arrival, forming: existing manager, 1 of 3 counted",
      },
    ],
    render(env) {
      const content = `<div class="m23-flush">${teamPage(env, { panel: panelHtml(env, env.v.key === "arrival") })}</div>`;
      return ONB.phone(content, env, { tab: "fantasy", topbar: false, gutter: false });
    },
  });

  /* ================= S06 · M3a, M3b: the hub block ================= */
  const hubLine = (env) => {
    const gw = gwOf(env);
    switch (env.v.key) {
      case "eve2":
        return env.t(K + "m3.eve", { gw });
      case "notFinal2":
        return env.t(K + "m3.over", { gw });
      case "insufficient3":
        return env.t(K + "m3.insufficient");
      case "late":
        return env.t(K + "m3.late", { season: env.ctx.nextSeason });
      default:
        // The dot and the colon bind to the word before them, so a line never starts with one.
        return env.t(K + "m3.line", { gw }).replace(/ ([·:]) /g, "\u00a0$1 ");
    }
  };

  /** How long the direction's tick beat takes on the 64px token, read from the beat itself (a probe
   * token is set off-screen and its animations measured), so the counter can change at the instant
   * the stripe is done whatever the direction. 0 when nothing animates (reduced motion). */
  const tickLength = (env) => {
    try {
      const probe = document.createElement("div");
      probe.className = `onb app-${env.scheme}`;
      probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
      probe.innerHTML = env.card("token", { size: 64, beat: "tick" });
      document.body.appendChild(probe);
      const end = Math.max(
        0,
        ...probe.getAnimations({ subtree: true }).map((a) => {
          const t = a.effect.getComputedTiming().endTime;
          return Number.isFinite(t) ? t : 0;
        }),
      );
      probe.remove();
      return Math.round(end);
    } catch (e) {
      return 0;
    }
  };

  /** The counter: under motion it holds the digit before this round until the beat's stripe is done
   * (an aria-hidden copy), while the real figure is in the page from the start. */
  const counter = (env, tick) => {
    const now = env.t(K + "m3.counter");
    if (!tick) return `<span class="m23-counter">${now}</span>`;
    const was = env.t(K + "m3.counter", { k: env.p.counted - 1 });
    return `<span class="m23-counter"><span class="m23-cnt">${now}</span><span class="m23-cnt m23-cnt--was" aria-hidden="true">${was}</span></span>`;
  };

  /** The block taps through to the card page: one button, no inner control. */
  const hubBlock = (env) => {
    const late = env.v.key === "late";
    // A late signer's season is over: nothing was counted just now, so no tick beat and no counter
    // change; the plan's line leads and the count and the season sit under it.
    const tick = !late && env.p.counted > 0 && motionOn(env) ? tickLength(env) : 0;
    const head = late
      ? ""
      : `<span class="m23-hub__top">${counter(env, tick)}<span class="onb-t-strong">${env.t(K + "m3.label")}</span></span>`;
    const body = late
      ? `<span class="m23-hub__late"><span class="onb-t-strong">${hubLine(env)}</span>` +
        `<span class="m23-hub__line">${env.t(K + "m3.counter")} · ${ONB.iso(env.p.season, env)}</span></span>`
      : `<span class="m23-hub__line">${hubLine(env)}</span>`;
    return (
      `<button type="button" class="onb-surface m23-hub${tick ? " m23-hub--tick" : ""}"${tick ? ` style="--m23-tick:${tick}ms"` : ""}>` +
      env.card("token", late ? { size: 64 } : { size: 64, beat: "tick" }) +
      `<span class="m23-hub__txt">${head}${body}</span>` +
      `<span class="m23-hub__go">${ONB.icon("chevron")}</span></button>`
    );
  };

  ONB.screen({
    id: "S06",
    moment: "M3a · M3b",
    title: "Hub: the card block while the card forms",
    variants: [
      { key: "forming1", fixture: "forming1", label: "Forming, 1 of 3, next round and deadline" },
      {
        key: "eve2",
        fixture: "eve2",
        label: "Eve: last round before the first rating (J7 locked)",
      },
      { key: "notFinal2", fixture: "notFinal2", label: "Round over, not final yet" },
      {
        key: "insufficient3",
        fixture: "insufficient3",
        label: "3 of 3 counted, the rating waits for a stat",
      },
      {
        key: "late",
        fixture: "forming1",
        label: "Late signer: season closed below the minimum",
        ctx: { seasonClosed: true, nextSeason: "2027/28" },
      },
    ],
    render(env) {
      const sk = ONB.skeleton;
      const content =
        sk.hubAbove(env) +
        `<div style="margin-block-start:12px">${hubBlock(env)}</div>` +
        `<div style="margin-block-start:24px">${sk.hubBelow(env)}</div>`;
      return ONB.phone(content, env, {
        tab: "fantasy",
        title: env.t("app.fantasy.title"),
        scrollTo: ".onb-hub-anchor",
      });
    },
  });

  /* ================= S07 · M3c–M3f ================= */
  const hint = (env, key) => ONB.alert(env.t(K + key), env, { tone: "info", dismiss: true });

  /* M3c: rankings, the "my position" line with the 44px token and 1/3. */
  const rankScreen = (env) => {
    const tabs =
      `<div class="m23-tabs" role="tablist" aria-label="${env.text("app.rankings.title")}">` +
      [
        ["sort_overall", true],
        ["sort_gameweek", false],
        ["tab_leagues", false],
      ]
        .map(
          ([k, on]) =>
            `<button type="button" role="tab" class="m23-tab" aria-selected="${on}">${env.t("app.rankings." + k)}</button>`,
        )
        .join("") +
      `</div>`;
    const position =
      `<div class="m23-pos"><span class="m23-pos__edge" aria-hidden="true"></span>` +
      `<div class="m23-pos__main"><p class="onb-t-label onb-muted">${env.t("app.my_rank")}</p>` +
      `<p>${bar(112, 34)}</p>` +
      `<p class="m23-pos__sec"><span class="m23-inl">${bar(58, 13)}</span><span class="onb-muted" aria-hidden="true">·</span><span class="m23-inl">${bar(28, 13)}<span class="onb-muted">${env.t("app.points.unit")}</span></span><span class="onb-muted" aria-hidden="true">·</span><span class="m23-inl">${bar(24, 13)}</span></p></div>` +
      `<div class="m23-pos__trail"><button type="button" class="m23-pos__card">${env.card("token", { size: 44 })}<span class="m23-pos__k">${env.t(K + "m3.counter")}</span></button>` +
      ibtn("target", env.text("app.rankings.jump")) +
      `</div></div>`;
    const search =
      `<label class="m23-search">${ONB.icon("search", { size: 18 })}` +
      `<input type="search" readonly placeholder="${env.text("app.rankings.search")}" aria-label="${env.text("app.rankings.search")}" /></label>`;
    const head = ["#", "app.rankings.manager", "app.rankings.gw", "app.rankings.total", "+/−"]
      .map(
        (c, i) =>
          `<th scope="col"${i > 1 ? ' class="m23-n"' : ""}>${c.startsWith("app.") ? env.t(c) : c}</th>`,
      )
      .join("");
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .map(
        (n) =>
          `<tr><td><span class="m23-rankno">${env.num(n)}</span></td><td>${bar(n % 2 ? 118 : 96, 13)}${bar(70, 11)}</td>` +
          `<td class="m23-n">${bar(20, 13)}</td><td class="m23-n">${bar(34, 15)}</td><td class="m23-n">${bar(26, 13)}</td></tr>`,
      )
      .join("");
    const table = `<table class="m23-table"><caption class="m23-sr">${env.t("app.rankings.title")}</caption><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    return (
      appHeader(env, { kicker: env.t("app.nav.fantasy"), title: env.t("app.rankings.tab") }) +
      tabs +
      `<section class="m23-rank">${position}${search}${table}</section>`
    );
  };

  /* M3d: "Ma journée BotolaGO", the private line under the total. */
  const recapScreen = (env) => {
    const gw = env.ctx.firstGw ?? 5; // the one counted round
    const selector =
      `<div class="m23-hdr-sel" role="group" aria-label="${env.text("app.gameweek")}">` +
      `<button type="button" class="onb-iconbtn" aria-label="${env.text("app.gameweek")} ${gw - 1}">${ico("chev-l", { dir: true })}</button>` +
      `<span class="m23-hdr-sel__mid"><span class="onb-t-label onb-muted">${env.t("app.gameweek")}</span><span class="onb-t-stat">${env.num(gw)}</span></span>` +
      `<button type="button" class="onb-iconbtn" aria-label="${env.text("app.gameweek")} ${gw + 1}">${ico("chev-r", { dir: true })}</button></div>`;
    const card =
      `<section class="onb-surface m23-recap"><div class="m23-recap__head"><div>` +
      `<p class="onb-t-label onb-muted">${env.t("app.recap.title")}</p>` +
      `<h2 class="onb-t-strong" style="margin-block-start:4px">${env.t("app.recap.gameweek", { n: gw })} · ${env.t("app.recap.final")}</h2>` +
      `<p style="margin-block-start:2px">${bar(96, 13)}</p></div>${ibtn("share", env.text("app.recap.share"))}</div>` +
      `<p class="m23-recap__total">${bar(64, 40)}<span class="onb-t-label onb-muted">${env.t("app.points.unit")}</span></p>` +
      `<p class="m23-recap__card">${env.t(K + "m3.recap")}</p>` +
      `<div class="m23-recap__lines">${bar("92%", 13)}${bar("72%", 13)}</div>` +
      `<div class="m23-recap__foot"><button type="button" class="onb-btn onb-btn--text m23-underline">${env.t("app.recap.detail")}</button>` +
      ONB.button(env.t("app.pick_team"), { kind: "primary" }) +
      `</div></section>`;
    const pointsStrip = strip([
      { label: env.t("app.points"), value: bar(56, 28), sub: bar(86, 12) },
    ]);
    return (
      appHeader(env, {
        kicker: env.t("app.fantasy.title"),
        title: bar(120, 18, "onb-sk--pill"),
        label: env.text("app.points"),
        extra: selector,
      }) +
      card +
      `<div style="margin-block-start:12px">${pointsStrip}</div>` +
      toggle(env) +
      pitch({ rows: [1, 4, 4, 2] })
    );
  };

  /* M3e (captain): the player action sheet, open, the hint above the first action. */
  const captainSheet = (env) => {
    const id = MC.uid("m23-sh");
    const row = (icon, key) =>
      `<button type="button" class="m23-sheet__row"><span class="onb-disc">${ico(icon)}</span><span>${env.t(key)}</span></button>`;
    return (
      `<div class="onb-overlay"><section class="onb-sheet m23-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}">` +
      `<div class="onb-sheet__grab" aria-hidden="true"><span></span></div>` +
      `<h2 id="${id}" class="m23-sr">${env.t("app.captain")}</h2>` +
      `<div class="m23-sheet__head"><span class="m23-sheet__shirt">${ONB.icon("shirt", { size: 30 })}</span>` +
      `<div class="m23-sheet__who">${bar(150, 17)}${bar(96, 11)}</div>` +
      `<button type="button" class="onb-iconbtn m23-glass" aria-label="${env.text("app.close")}">${ONB.icon("x")}</button></div>` +
      `<div class="m23-sheet__body"><div class="m23-sheet__hint">${hint(env, "m3.hint.cap")}</div>` +
      row("shield", "app.make_captain") +
      row("shield-half", "app.make_vice") +
      row("swap", "app.substitute") +
      row("info", "app.player_info") +
      `</div></section></div>`
    );
  };

  /* M3e (substitution): the player is picked, the cancel bar sits above the tabs, the hint above it. */
  const subDock = (env) =>
    `<div class="m23-dock m23-dock--float">${hint(env, "m3.hint.sel")}` +
    ONB.button(`${env.t("app.cancel")} — ${env.t("app.substitute")}`, {
      kind: "ink",
      full: true,
      icon: "x",
    }) +
    `</div>`;

  /* M3e (transfers): the Transfers screen, first visit, the hint above the Terrain | Liste header. */
  const transfersScreen = (env) => {
    const gw = gwOf(env);
    return (
      appHeader(env, { kicker: env.t("app.fantasy.title"), title: env.t("app.transfers") }) +
      strip(
        [
          { label: env.t("app.free_transfers"), value: bar(24, 16) },
          { label: env.t("app.cost"), value: bar(24, 16) },
          { label: env.t("app.bank"), value: bar(40, 16) },
        ],
        deadlineLine(env, gw),
      ) +
      `<div class="m23-gut" style="padding-block-start:12px">${hint(env, "m3.hint.trf")}</div>` +
      toggle(env) +
      pitch({ rows: [2, 5, 5, 3], bench: false }) +
      `<div class="m23-dock m23-dock--solid"><div class="m23-dock__row">` +
      ONB.button(env.t("app.add_player"), { kind: "primary", full: true, icon: "plus" }) +
      ONB.button(env.t("app.next"), { kind: "ink", full: true }) +
      `</div></div>`
    );
  };

  /* M3f: the transfer confirmation with the TRF line under the Out / In card. */
  const confirmScreen = (env) => {
    const gw = gwOf(env);
    const line = (side) => {
      const out = side === "out";
      return (
        `<div class="m23-pair"><span class="m23-pair__edge" aria-hidden="true" style="background:var(--ui-${out ? "negative" : "positive"})"></span>` +
        `<div class="m23-pair__in"><span class="m23-pair__lbl" style="color:var(--ui-${out ? "negative" : "positive"})">${env.t("app.transfer." + side)}</span>` +
        `<span class="m23-pair__disc">${ONB.icon("shirt", { size: 22 })}</span>` +
        `<span class="onb-grow">${bar(112, 14)}<span style="display:block;margin-block-start:5px">${bar(64, 10)}</span></span>${bar(30, 14)}</div></div>`
      );
    };
    const kv = (key) =>
      `<div class="m23-kv"><span class="onb-t-secondary">${env.t(key)}</span>${bar(34, 14)}</div>`;
    return (
      appHeader(env, { kicker: env.t("app.fantasy.title"), title: env.t("app.transfers") }) +
      `<div class="m23-band"><p class="m23-band__title">${env.t("app.transfer.about_one")}</p><p class="m23-band__sub">${deadlineLine(env, gw)}</p></div>` +
      `<section class="onb-surface m23-gut" style="margin:16px var(--ui-gutter) 0;padding:0;overflow:hidden"><div style="border-block-end:1px solid var(--ui-rule)">${line("out")}${line("in")}</div>` +
      `<p class="onb-t-meta onb-muted" style="padding:12px 16px;text-align:center">${env.t("app.transfer.active_note", { gw })}</p></section>` +
      `<div class="m23-gut" style="margin-block-start:12px">${ONB.alert(env.t(K + "m3.first_transfer"), env, { tone: "info" })}</div>` +
      `<section class="m23-gut" style="margin-block-start:24px"><h2 class="onb-t-section" style="padding-block-end:10px">${env.t("app.transfer.overview")}</h2>` +
      `<div class="onb-surface" style="padding-inline:12px">${kv("app.transfer.free_used")}${kv("app.transfer.paid_used")}${kv("app.transfer.left_in_bank")}</div>` +
      `</section>` +
      chipsRow(env) +
      `<div class="m23-dock m23-dock--solid"><div class="m23-dock__row m23-dock__row--even">` +
      ONB.button(env.t("app.edit_transfers"), { kind: "soft", full: true }) +
      ONB.button(env.t("app.confirm"), { kind: "ink", full: true }) +
      `</div></div>`
    );
  };

  ONB.screen({
    id: "S07",
    moment: "M3c · M3d · M3e · M3f",
    title: "Formation on the screens where it is earned",
    variants: [
      {
        key: "rank",
        fixture: "forming1",
        label: "M3c: rankings, my position with the 44px token and 1/3",
      },
      { key: "recap", fixture: "forming1", label: "M3d: Ma journée BotolaGO, the private line" },
      {
        key: "hint-cap",
        fixture: "forming1",
        label: "M3e: captain action sheet, open after the tap",
      },
      { key: "hint-sel", fixture: "forming1", label: "M3e: first substitution, a player picked" },
      { key: "hint-trf", fixture: "forming1", label: "M3e: first visit to Transfers" },
      { key: "first-transfer", fixture: "forming1", label: "M3f: transfer confirmation, TRF line" },
    ],
    render(env) {
      const k = env.v.key;
      const wrap = (html) => `<div class="m23-flush">${html}</div>`;
      const opts = { tab: "fantasy", topbar: false, gutter: false };
      if (k === "rank") return ONB.phone(wrap(rankScreen(env)), env, opts);
      if (k === "recap") return ONB.phone(wrap(recapScreen(env)), env, opts);
      if (k === "hint-cap")
        return ONB.phone(wrap(teamPage(env)), env, { ...opts, overlay: captainSheet(env) });
      if (k === "hint-sel")
        return ONB.phone(wrap(teamPage(env, { sel: 5, dock: subDock(env) })), env, opts);
      if (k === "hint-trf") return ONB.phone(wrap(transfersScreen(env)), env, opts);
      return ONB.phone(wrap(confirmScreen(env)), env, opts);
    },
  });
})();
