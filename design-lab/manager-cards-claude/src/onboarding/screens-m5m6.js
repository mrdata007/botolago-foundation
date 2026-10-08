/* S10 · M5 · the league page with its band, the rows, and the head-to-head sheet.
   S11 · M6 · the share sheet (French and Arabic) and the 1080 x 1920 share image.

   The league page mocks src/routes/fantasy.leagues.$leagueId.tsx: the header (kicker and league
   name), the three tabs, the "last updated" line and the standings card (Pos, team, J.n, Total,
   movement). The card adds a band above the table and, inside the name cell, a 28px mini with the
   card's state on a second line. The rows stay in the league's own points order: nothing here is
   ranked, sorted or filtered by a card number, and the band names people without their numbers.
   The band is the stands: the card's own night ground with a silver barrier rail along its top (as
   the share image's) and the newly rated friends' minis hung from it; the compare hint under it is a
   plain muted line. The head-to-head opens from a row and carries no share. The share sheet mocks
   ShareImageSheet, with WhatsApp first; its message is written in "tu" because the manager is the
   one speaking. The only motion is the head-to-head's bars growing from their baseline (the data
   being measured); no card, mini or message moves.

   League members use MC.SAMPLES names with onboarding-style profiles: some rated, one still forming
   (2 of 3), serials drawn without a leading zero, no founder. */
(function () {
  const MC = window.MC;
  const ONB = MC.ONB;
  if (!ONB || !ONB.screen) return;
  const K = "card.onboarding.";
  const esc = MC.esc;

  /* ---------- strings: the app's own labels (copied from the dictionaries) and two proposals ---------- */
  ONB.addStrings({
    fr: {
      "app.league.tab": "Ligue",
      "app.league.tab.predictions": "Pronostics",
      "app.league.updated": "Dernière mise à jour",
      "app.league.standings": "Classement",
      "app.league.pos": "Pos",
      "app.league.team": "Équipe",
      "app.league.gw": "J.",
      "app.league.movement": "Mouvement",
      "app.league.leave": "Quitter la ligue",
      "app.rank.up": "En hausse",
      "app.rank.down": "En baisse",
      "app.rank.same": "Position inchangée",
      "app.report.menu_label": "Signaler « {name} »",
      // proposed: the plan writes the score line with « Vous » inside it, and the sheet needs the word alone
      [K + "m5.h2h.you"]: "Vous",
      // proposed: the plan says « provisoire » is added to the message whenever it applies
      [K + "m6.msg.plain_prov"]: "Ma carte BotolaGO : {ovr} (provisoire). Et toi ? {link}",
    },
    ar: {
      "app.league.tab": "الدوري",
      "app.league.tab.predictions": "التوقعات",
      "app.league.updated": "آخر تحديث",
      "app.league.standings": "الترتيب",
      "app.league.pos": "المركز",
      "app.league.team": "الفريق",
      "app.league.gw": "ج.",
      "app.league.movement": "التغيّر",
      "app.league.leave": "مغادرة الدوري",
      "app.rank.up": "تقدّم",
      "app.rank.down": "تراجع",
      "app.rank.same": "المركز دون تغيير",
      "app.report.menu_label": "إبلاغ عن «{name}»",
      [K + "m5.h2h.you"]: "أنت",
      [K + "m6.msg.plain_prov"]: "بطاقتي في BotolaGO: ‏{ovr} (مبدئي). وأنت؟ {link}",
    },
  });

  /* ---------- the league: sample members, in the league's points order ---------- */
  const LEAGUE_NAME = { lat: "Les amis du quartier", ar: "أصدقاء الحي" };
  const UPDATED = { lat: "lun. 12 oct., 09:10", ar: "الاثنين 12 أكتوبر، 09:10" };
  const LINK = "botolago.com/jouer";
  // `me` is the fixture's own profile. gw and total are the league's points after J7; move is the
  // places gained (+) or lost (-) since J6. firstGw is the gameweek the first number arrived.
  const MEMBERS = [
    {
      key: "yasmine",
      serial: "317204",
      ovr: 88,
      tier: "CHAMPION",
      counted: 7,
      provisional: false,
      firstGw: 3,
      stats: { CAP: 92, SEL: 86, TRF: 90, CON: 84 },
      gw: 61,
      total: 438,
      move: 0,
    },
    {
      key: "othmane",
      serial: "119025",
      ovr: 79,
      tier: "STADE",
      counted: 3,
      provisional: true,
      firstGw: 7,
      stats: { CAP: 85, SEL: 80, TRF: 71, CON: 79 },
      gw: 70,
      total: 196,
      move: 0,
    },
    { key: "me", gw: 66, total: 188, move: 1 },
    {
      key: "salma",
      serial: "204668",
      ovr: 66,
      tier: "HOMA",
      counted: 3,
      provisional: true,
      firstGw: 7,
      stats: { CAP: 70, SEL: 64, TRF: null, CON: 64 },
      statReason: { TRF: "no_transfers" },
      gw: 46,
      total: 171,
      move: -1,
    },
    {
      key: "hamza",
      serial: "311157",
      ovr: null,
      tier: null,
      counted: 2,
      provisional: false,
      club: null,
      stats: { CAP: null, SEL: null, TRF: null, CON: null },
      gw: 58,
      total: 119,
      move: 0,
    },
  ];

  /** The league with a profile on each member (MC.SAMPLES names, onboarding states). */
  const leagueOf = (env) =>
    MEMBERS.map((m, i) => {
      if (m.key === "me") return { ...m, rank: i + 1, me: true, p: env.p };
      const s = MC.SAMPLES.find((x) => x.key === m.key);
      const p = Object.freeze({
        ...MC.sample({ ...s, founder: null, serial: m.serial, ovr: m.ovr, tier: m.tier }),
        provisional: m.provisional,
        counted: m.counted,
        minRated: env.p.minRated,
        minFinal: env.p.minFinal,
        stats: m.stats,
        statReason: m.statReason || {},
        ...(m.club === null ? { club: null } : {}),
      });
      return { ...m, rank: i + 1, p };
    });

  /** The name as the app writes a team name: "Othmane", never the card's capitals. */
  const nameOf = (env, p) => {
    const n = MC.nameOf(p, env.o);
    return env.ar ? n : n.charAt(0) + n.slice(1).toLowerCase();
  };
  const ltrRun = (s) => `<bdi dir="ltr">${esc(s)}</bdi>`;

  /* ---------- small drawings the kit's icon set lacks (lucide paths, 24 grid) ---------- */
  const GLYPH = {
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    share:
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  };
  const glyph = (name, size = 18) =>
    `<svg class="onb-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLYPH[name]}</svg>`;
  const tri = (up) =>
    `<svg width="8" height="7" viewBox="0 0 8 7" fill="currentColor" aria-hidden="true" focusable="false"><path d="${up ? "M4 0 8 7H0Z" : "M4 7 0 0h8Z"}"/></svg>`;

  /* ---------- styles ---------- */
  ONB.style(
    "m5m6",
    `
.onb .m56 { --m56-lh: 1.4; }
.onb[dir="rtl"] .m56 { --m56-lh: 1.65; }
.onb .m56-sr { position: absolute; top: 0; inset-inline-start: 0; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* the page: header kicker, tabs, panel */
.onb .m56-kick { display: block; font: 800 12px/var(--m56-lh) var(--onb-body); color: var(--ui-on-surface-muted); text-transform: uppercase; }
.onb:not([dir="rtl"]) .m56-kick { letter-spacing: 0.025em; }
.onb .m56-page { margin-block-start: -14px; }
.onb .m56-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); padding-inline: 8px; background: var(--ui-surface); border-block-end: 1px solid var(--ui-rule); }
.onb .m56-tab { display: flex; align-items: center; justify-content: center; min-height: 48px; min-width: 0; padding-inline: 4px; color: var(--ui-on-surface-muted); font: 600 16px/var(--ui-leading-display) var(--onb-display); }
.onb .m56-tab[aria-selected="true"] { color: var(--ui-on-surface); font-weight: 800; box-shadow: inset 0 -4px 0 var(--ui-ink-fg); }
.onb .m56-panel { padding: 12px 16px 24px; }
.onb .m56-updated { text-align: center; }
.onb .m56-updated strong { color: var(--ui-on-surface); font-weight: 800; }
.onb .m56-panel > * + * { margin-block-start: 10px; }
.onb .m56-panel .onb-alert__text { text-wrap: balance; }
.onb .m56-panel > .m56-updated + * { margin-block-start: 12px; }

/* the band: the stands. The night ground of the share image (a dark ground in either scheme, so
   the minis take their dark-ground rendering: app-dark), a silver barrier rail along its top (the
   share's rail, and the minis' own rails are the same silver) and the newly rated friends' minis
   hanging from it; names only beside them. */
.onb .m56-band { position: relative; display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 20px 14px 10px; border-radius: var(--ui-radius-card); background: linear-gradient(to bottom, var(--ui-ink-deep), var(--ui-ink) 75%); box-shadow: inset 0 0 0 1px var(--ui-ink-edge); color: var(--ui-on-ink-plain); }
.onb .m56-band__rail { position: absolute; inset-block-start: 8px; inset-inline: 8px; height: 7px; border-radius: 999px; background: linear-gradient(to bottom, #eef2f6 0%, #c3cbd5 38%, #a9b2be 62%, #5f6773 100%); box-shadow: 0 1px 2px color-mix(in oklab, oklch(0 0 0) 55%, transparent); }
.onb .m56-band__minis { display: flex; flex: none; align-items: flex-start; align-self: flex-start; gap: 10px; margin-block-start: -9px; }
.onb .m56-band__mini { display: inline-flex; }
.onb .m56-band__text { flex: 1 1 0; min-width: 0; text-wrap: balance; font: 600 13px/var(--ui-leading-copy) var(--onb-body); color: color-mix(in srgb, var(--ui-on-ink-plain) 82%, var(--ui-ink)); }
.onb .m56-band__text b { color: var(--ui-on-ink-plain); font-weight: 800; }
.onb .m56-names { display: block; font-size: 14px; }
/* the compare hint: one muted line with its close, no box */
.onb .m56-hint { display: flex; align-items: center; gap: 4px; margin-block-start: 2px; padding-inline-start: 2px; color: var(--ui-on-surface-muted); }
.onb .m56-hint p { flex: 1 1 0; min-width: 0; font: 600 13px/var(--ui-leading-copy) var(--onb-body); text-wrap: pretty; }
.onb .m56-panel > .m56-hint { margin-block-start: 0; }

/* the standings card: the app's columns (Pos, team, J.n, Total, movement), the card's line under the name */
.onb .m56-table { overflow: hidden; background: var(--ui-surface); border-radius: var(--ui-radius-card); box-shadow: var(--ui-card-shadow); }
.onb .m56-head, .onb .m56-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 40px 62px 48px; align-items: center; }
.onb .m56-head { padding-block: 8px; color: var(--ui-on-surface-muted); font: 800 12px/var(--m56-lh) var(--onb-body); text-transform: uppercase; }
.onb:not([dir="rtl"]) .m56-head { letter-spacing: 0.025em; }
.onb .m56-head > :nth-child(1) { padding-inline-start: 16px; }
.onb .m56-head > :nth-child(n + 3) { text-align: end; }
.onb .m56-head > :nth-child(4), .onb .m56-total { padding-inline-end: 12px; }
.onb .m56-fig { padding-inline-end: 4px; }
.onb .m56-head > :nth-child(5) { padding-inline-end: 16px; }
.onb .m56-head > :nth-child(2) { padding-inline: 8px; }
.onb .m56-row { padding-block: 6px 7px; border-block-start: 1px solid var(--ui-rule); }
.onb .m56-row.is-me { background: color-mix(in oklab, var(--ui-ink-fg) 12%, var(--ui-surface)); }
.onb .m56-pos { padding-inline-start: 16px; font: 800 17px/var(--m56-lh) var(--onb-body); font-variant-numeric: tabular-nums; color: var(--ui-on-surface-muted); }
.onb .m56-pos.is-top { color: var(--ui-on-surface); }
.onb .m56-who { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 36px; padding-inline: 8px 0; }
.onb .m56-name { flex: 1 1 0; min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; font: 800 15px/var(--m56-lh) var(--onb-body); color: var(--ui-on-surface); }
.onb .m56-flag { position: relative; flex: none; display: grid; place-items: center; width: 44px; height: 44px; margin: -4px -6px; color: var(--ui-on-surface-muted); z-index: 1; }
/* painted 32px, quiet until pressed; the 44px box is the target */
.onb .m56-flag::before { content: ""; position: absolute; width: 32px; height: 32px; border-radius: 999px; }
.onb .m56-flag:active::before { background: var(--ui-surface-sunken); }
.onb .m56-flag .onb-ico { position: relative; }
.onb .m56-fig { font: 600 13px/var(--m56-lh) var(--onb-body); font-variant-numeric: tabular-nums; color: var(--ui-on-surface-muted); text-align: end; }
.onb .m56-total { font: 800 17px/var(--m56-lh) var(--onb-body); font-variant-numeric: tabular-nums; color: var(--ui-on-surface); text-align: end; }
.onb .m56-move { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; padding-inline-end: 16px; font: 700 13px/var(--m56-lh) var(--onb-body); font-variant-numeric: tabular-nums; color: var(--ui-on-surface-muted); }
.onb .m56-move.is-up { color: var(--ui-positive); }
.onb .m56-move.is-down { color: var(--ui-negative); }
/* the gain on the highlighted row: a deeper green, so the 13px figure keeps 4.5:1 on the tint */
.onb.app-light .m56-row.is-me .m56-move.is-up { color: color-mix(in oklab, var(--ui-positive) 72%, oklch(0 0 0)); }
.onb .m56-card-line { grid-column: 2 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; margin-block-start: -2px; padding-inline: 8px 16px; padding-inline-start: 44px; font: 600 12px/var(--m56-lh) var(--onb-body); color: var(--ui-on-surface-muted); }
.onb .m56-card-line b { color: var(--ui-on-surface); font-weight: 800; }
.onb .m56-prov { display: inline-flex; align-items: center; min-height: 18px; padding: 0 7px; border-radius: 999px; border: 1px solid color-mix(in oklab, var(--ui-ink-fg) 32%, transparent); color: var(--ui-ink-fg); font: 800 11px/var(--m56-lh) var(--onb-body); white-space: nowrap; }
/* a tap anywhere on a friend's row opens the comparison (the row's own handler in the product); the
   button inside the name cell is the focusable control, painted 36px and a 44px target */
.onb .m56-row:not(.is-me) { cursor: pointer; }
.onb .m56-row:not(.is-me):active { background: color-mix(in oklab, var(--ui-ink-fg) 8%, var(--ui-surface)); }
.onb .m56-open { flex: 1 1 0; display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 44px; margin-block: -4px; text-align: start; }
.onb .m56-open .onb-card--token { flex: none; }
.onb .m56-open:focus-visible, .onb .m56-flag:focus-visible, .onb .m56-friend:focus-visible, .onb .m56-tab:focus-visible, .onb .m56-leave:focus-visible { outline: 2px solid var(--ui-ink-fg); outline-offset: -3px; }
.onb .m56-leave { display: flex; align-items: center; justify-content: center; min-height: 44px; padding-inline: 16px; border-radius: 999px; border: 1px solid var(--ui-rule-strong); color: var(--ui-on-surface); font: 800 14px/var(--ui-leading-copy) var(--onb-body); }

/* the head-to-head sheet */
.onb .m56-h2h { display: flex; flex-direction: column; gap: 12px; padding-block: 2px 14px; }
.onb .m56-circle { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.onb .m56-friend { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-width: 44px; min-height: 60px; padding: 6px 2px; border-radius: var(--ui-radius-card); color: var(--ui-on-surface-muted); font: 600 12px/var(--m56-lh) var(--onb-body); }
.onb .m56-friend span:last-child { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.onb .m56-friend[aria-pressed="true"] { background: color-mix(in oklab, var(--ui-ink-fg) 12%, var(--ui-surface)); box-shadow: inset 0 0 0 2px var(--ui-ink-fg); color: var(--ui-on-surface); font-weight: 800; }
.onb .m56-sub { display: block; font: 600 13px/var(--m56-lh) var(--onb-body); color: var(--ui-on-surface-muted); }
.onb .onb-sheet__head .onb-t-sub { line-height: 1.3; }
.onb .m56-face { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; column-gap: 14px; row-gap: 8px; justify-items: center; padding: 12px 8px 10px; border-radius: var(--ui-radius-sheet); background: var(--ui-surface-sunken); }
.onb .m56-slot { display: flex; align-items: flex-start; justify-content: center; min-width: 0; }
.onb .m56-cap { display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 52px; min-width: 0; text-align: center; }
.onb .m56-who-name { font: 800 16px/var(--m56-lh) var(--onb-display); color: var(--ui-on-surface); }
.onb .m56-form { display: inline-flex; align-items: center; min-height: 24px; padding: 1px 10px; border-radius: 999px; border: 1px solid color-mix(in oklab, var(--ui-ink-fg) 32%, transparent); background: color-mix(in oklab, var(--ui-ink-fg) 9%, var(--ui-surface)); color: var(--ui-ink-fg); font: 800 12px/var(--m56-lh) var(--onb-body); white-space: nowrap; }
.onb .m56-vs { display: flex; flex-direction: column; }
.onb .m56-vs li { display: grid; grid-template-columns: 32px minmax(0, 1fr) 68px minmax(0, 1fr) 32px; align-items: center; column-gap: 8px; min-height: 44px; border-block-end: 1px solid var(--ui-rule); }
.onb .m56-vs li:last-child { border-block-end: 0; }
.onb .m56-val { font: 700 20px/var(--m56-lh) var(--onb-body); font-variant-numeric: tabular-nums; color: var(--ui-on-surface); }
.onb .m56-val.is-high { font-weight: 800; }
.onb .m56-val.is-low { font-weight: 600; color: var(--ui-on-surface-muted); }
.onb .m56-val--them { text-align: end; }
.onb .m56-code { text-align: center; font: 800 12px/var(--m56-lh) var(--onb-body); color: var(--ui-on-surface-muted); text-transform: uppercase; overflow-wrap: anywhere; }
.onb:not([dir="rtl"]) .m56-code { letter-spacing: 0.025em; }
.onb .m56-bar { display: flex; height: 6px; border-radius: 3px; background: var(--ui-surface-sunken); overflow: hidden; }
.onb .m56-bar i { display: block; width: calc(var(--v) * 1%); height: 100%; border-radius: 3px; background: var(--ui-ink-fg); }
.onb .m56-bar.is-low i { background: color-mix(in oklab, var(--ui-ink-fg) 58%, var(--ui-surface-sunken)); }
.onb .m56-bar--me { justify-content: flex-end; }
.onb .m56-bar--me i { transform-origin: 100% 50%; }
.onb[dir="rtl"] .m56-bar--me i { transform-origin: 0% 50%; }
.onb .m56-bar--them i { transform-origin: 0% 50%; }
.onb[dir="rtl"] .m56-bar--them i { transform-origin: 100% 50%; }

/* the share sheet: the message as it will land, then the buttons in the thumb zone */
.onb .m56-share { display: flex; flex-direction: column; align-items: center; padding-block: 4px 10px; }
.onb .m56-msg { display: flex; flex-direction: column; gap: 8px; width: min(100%, 248px); padding: 8px; border-radius: 16px; background: var(--ui-surface-sunken); color: var(--ui-on-surface); }
.onb .m56-msg__img { display: flex; justify-content: center; border-radius: 10px; overflow: hidden; line-height: 0; }
.onb .m56-msg__text { padding: 0 4px 2px; font: 600 13px/var(--ui-leading-copy) var(--onb-body); }
.onb .m56-foot { display: flex; flex-direction: column; gap: 8px; }
.onb .m56-hhero { display: flex; gap: 16px; align-items: flex-start; }
.onb .m56-hcol { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.onb .m56-hovr { display: inline-flex; align-items: baseline; gap: 6px; align-self: flex-start; }

/* the share image, shown as exported */
.onb .m56-shot { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.onb .m56-shot .onb-card--share { box-shadow: 0 0 0 1px var(--ui-rule-strong), var(--ui-shadow-lifted); }

/* motion: only the head-to-head's bars, growing from their baseline (what they show is the length,
   so the growth is the data being measured); together, no stagger, no fade; none under reduced motion */
@media (prefers-reduced-motion: no-preference) {
  .onb .m56--motion .m56-bar i { animation: m56-measure 420ms cubic-bezier(0.16, 1, 0.3, 1) backwards; }
}
@keyframes m56-measure { from { transform: scaleX(0); } }
`,
  );

  const motionClass = (env) => (env.o.motion ? " m56--motion" : "");

  /* ---------- S10 · the league page ---------- */
  const miniOf = (env, p) => env.card("token", { size: 28, p });

  const bandHTML = (env, league) => {
    const gw = env.ctx.latestGw;
    const fresh = league.filter((m) => !m.me && m.firstGw === gw && m.ovr != null);
    if (!fresh.length) return "";
    // the names sit on their own line, bold, so the band reads at a glance: names only, no numbers
    const sep = env.ar ? "، " : ", ";
    const names = ONB.raw(
      `<b class="m56-names">${fresh.map((m) => esc(nameOf(env, m.p))).join(sep)}</b>`,
      fresh.map((m) => nameOf(env, m.p)).join(sep),
    );
    return (
      `<div class="m56-band app-dark"><span class="m56-band__rail" aria-hidden="true"></span>` +
      `<span class="m56-band__minis" aria-hidden="true">${fresh
        .slice(0, 3)
        .map(
          (m) => `<span class="m56-band__mini">${env.card("token", { size: 28, p: m.p })}</span>`,
        )
        .join("")}</span>` +
      `<p class="m56-band__text">${env.t(K + "m5.band", { gw, names })}</p>` +
      `</div>`
    );
  };

  /** The card's state under the name: the number with « Provisoire », or « en formation k/n ». */
  const cardLine = (env, m) => {
    const p = m.p;
    if (p.ovr == null) return env.t(K + "m5.row.forming", { k: p.counted, n: p.minRated });
    return (
      `<b>${ltrRun(p.ovr + " OVR")}</b>` +
      (p.provisional ? `<span class="m56-prov">${env.t(K + "common.provisional")}</span>` : "")
    );
  };

  const rowHTML = (env, m) => {
    const name = nameOf(env, m.p);
    const move = m.move
      ? `<span class="m56-move ${m.move > 0 ? "is-up" : "is-down"}">${tri(m.move > 0)}<span aria-hidden="true">${ONB.num(Math.abs(m.move), env)}</span><span class="m56-sr">${env.text(m.move > 0 ? "app.rank.up" : "app.rank.down")} ${ONB.num(Math.abs(m.move), env)}</span></span>`
      : `<span class="m56-move"><span aria-hidden="true">=</span><span class="m56-sr">${env.t("app.rank.same")}</span></span>`;
    const ident = `${miniOf(env, m.p)}<span class="m56-name" dir="auto">${esc(name)}</span>`;
    return (
      `<div class="m56-row${m.me ? " is-me" : ""}" role="row">` +
      `<span class="m56-pos${m.rank <= 3 ? " is-top" : ""}" role="cell">${ONB.num(m.rank, env)}</span>` +
      `<span class="m56-who" role="cell">` +
      (m.me
        ? `<span class="m56-open">${ident}</span>`
        : `<button type="button" class="m56-open" aria-label="${esc(name)}">${ident}</button>` +
          `<button type="button" class="m56-flag" aria-label="${env.text("app.report.menu_label", { name })}">${glyph("flag", 16)}</button>`) +
      `</span>` +
      `<span class="m56-fig" role="cell">${ONB.num(m.gw, env)}</span>` +
      `<span class="m56-total" role="cell">${ONB.num(m.total, env)}</span>` +
      `<span role="cell">${move}</span>` +
      `<span class="m56-card-line" role="cell">${cardLine(env, m)}</span>` +
      `</div>`
    );
  };

  const tableHTML = (env, league) =>
    `<div class="m56-table" role="table" aria-label="${env.text("app.league.standings")}">` +
    `<div class="m56-head" role="row">` +
    `<span role="columnheader">${env.t("app.league.pos")}</span>` +
    `<span role="columnheader">${env.t("app.league.team")}</span>` +
    `<span role="columnheader" title="${env.text("app.gameweek")}">${env.t("app.league.gw")}${ONB.num(env.ctx.latestGw, env)}</span>` +
    `<span role="columnheader">${env.t("app.total")}</span>` +
    `<span role="columnheader"><bdi dir="ltr" aria-hidden="true">+/−</bdi><span class="m56-sr">${env.t("app.league.movement")}</span></span>` +
    `</div>${league.map((m) => rowHTML(env, m)).join("")}</div>`;

  const leaguePage = (env, overlay) => {
    const league = leagueOf(env);
    const title = env.pick(LEAGUE_NAME);
    const tabs = [
      ["app.league.tab", true],
      ["app.league.tab.predictions", false],
      ["app.cups", false],
    ];
    const content =
      `<div class="m56 m56-page">` +
      `<div class="m56-tabs" role="tablist" aria-label="${env.text("app.league.tab")}">${tabs
        .map(
          ([k, on]) =>
            `<button type="button" role="tab" class="m56-tab" aria-selected="${on}">${env.t(k)}</button>`,
        )
        .join("")}</div>` +
      `<section class="m56-panel" role="tabpanel">` +
      `<p class="m56-updated onb-t-meta onb-muted">${env.t("app.league.updated")} : <strong><bdi>${ONB.iso(env.pick(UPDATED), env)}</bdi></strong></p>` +
      bandHTML(env, league) +
      `<div class="m56-hint"><p>${env.t(K + "m5.hint.compare")}</p>${ONB.iconButton("x", env.text(K + "common.close"), { variant: "ghost" })}</div>` +
      tableHTML(env, league) +
      `<button type="button" class="m56-leave">${env.t("app.league.leave")}</button>` +
      `</section></div>`;
    return ONB.phone(content, env, {
      back: true,
      title: `<span class="m56-kick" aria-hidden="true">${env.t("app.nav.fantasy")}</span> ${esc(title)}`,
      tab: "fantasy",
      gutter: false,
      overlay,
    });
  };

  /* ---------- S10 · the head-to-head sheet ---------- */
  const STATS = ["CAP", "SEL", "TRF", "CON"];

  // The directions' cards have different proportions (a scarf is 1 : 2, a boot sole 1 : 2.6, a goal
  // 1 : 0.8), so the face-off asks each card how tall it is at 100px and takes the widest width, up to
  // 160px, at which the taller one still fits the sheet: all four rows stay on screen.
  const MAX_W = 160;
  const MAX_H = 256;
  const fitWidth = (env, profiles) => {
    const probe = document.createElement("div");
    probe.className = `onb app-${env.scheme}`;
    probe.style.cssText = "position:fixed;left:-9999px;top:0;width:200px;visibility:hidden";
    probe.innerHTML = profiles.map((p) => env.card("full", { width: 100, p })).join("");
    document.body.appendChild(probe);
    const tallest = Math.max(
      ...[...probe.querySelectorAll('[data-onb-card="full"]')].map((el) => el.offsetHeight),
      100,
    );
    probe.remove();
    return Math.max(80, Math.min(MAX_W, Math.floor((MAX_H * 100) / tallest)));
  };
  const slot = (env, p, side, width) =>
    `<div class="m56-slot m56-${side}">${env.card("full", { width, p })}</div>`;
  const caption = (who, line, side) =>
    `<div class="m56-cap m56-${side}"><span class="m56-who-name">${who}</span>${line}</div>`;

  const sideLine = (env, p) =>
    p.ovr == null
      ? `<span class="m56-form">${env.t(K + "m5.row.forming", { k: p.counted, n: p.minRated })}</span>`
      : p.provisional
        ? ONB.provisionalChip(env)
        : "";

  const statRows = (env, a, b) =>
    `<ul class="m56-vs" aria-label="${env.text("app.league.standings")}">${STATS.map((k, i) => {
      const x = a.stats[k];
      const y = b.stats[k];
      // the higher side is heavier and its bar solid; the other lighter. Equal, or one side empty: both plain.
      const hi = x != null && y != null && x !== y ? (x > y ? "me" : "them") : "";
      const rank = (side) => (!hi ? "" : hi === side ? " is-high" : " is-low");
      const val = (v, side) =>
        `<span class="m56-val m56-val--${side}${rank(side)}">${v == null ? ONB.dash : ONB.num(v, env)}</span>`;
      const bar = (v, side) =>
        `<span class="m56-bar m56-bar--${side}${rank(side)}" aria-hidden="true">${v == null ? "" : `<i style="--v:${v};--i:${i}"></i>`}</span>`;
      return (
        `<li>${val(x, "me")}${bar(x, "me")}<span class="m56-code">${esc(env.stat(k).code)}</span>${bar(y, "them")}${val(y, "them")}` +
        `<span class="m56-sr">${esc(env.stat(k).code)} : ${ONB.num(x, env)}, ${ONB.num(y, env)}</span></li>`
      );
    }).join("")}</ul>`;

  const h2hSheet = (env, league) => {
    const me = league.find((m) => m.me);
    const friends = league.filter((m) => !m.me);
    const friend = friends.find((m) => m.key === env.ctx.friend) || friends[0];
    const fname = nameOf(env, friend.p);
    const w = fitWidth(env, [me.p, friend.p]);
    // the league's name rides under the score: the two of you, inside your group
    const score =
      env.t(K + "m5.h2h.score", {
        a: me.p.ovr == null ? ONB.dash : me.p.ovr,
        b: friend.p.ovr == null ? ONB.dash : friend.p.ovr,
        name: fname,
      }) +
      `<span class="m56 m56-sub"><span class="m56-sr">, </span>${esc(env.pick(LEAGUE_NAME))}</span>`;
    const circle = friends
      .map(
        (m) =>
          `<button type="button" class="m56-friend" aria-pressed="${m === friend}" aria-label="${esc(nameOf(env, m.p))}"><span>${miniOf(env, m.p)}</span><span>${esc(nameOf(env, m.p))}</span></button>`,
      )
      .join("");
    const body =
      `<div class="m56 m56-h2h${motionClass(env)}">` +
      `<div class="m56-circle" role="group" aria-label="${esc(env.pick(LEAGUE_NAME))}">${circle}</div>` +
      `<div class="m56-face">${slot(env, me.p, "a", w)}${slot(env, friend.p, "b", w)}` +
      `${caption(env.t(K + "m5.h2h.you"), sideLine(env, me.p), "a")}${caption(esc(fname), sideLine(env, friend.p), "b")}</div>` +
      statRows(env, me.p, friend.p) +
      `</div>`;
    return ONB.sheet(body, env, {
      height: 0.94,
      title: score,
      closeLabel: env.text(K + "m5.h2h.close"),
      footer: ONB.button(env.t(K + "m5.h2h.close"), { kind: "soft", full: true }),
    });
  };

  ONB.screen({
    id: "S10",
    moment: "M5",
    title: "League page: band, rows in points order, head-to-head sheet",
    variants: [
      {
        key: "band",
        fixture: "rated",
        label: "League page: band (names only), rows in points order, compare hint",
      },
      {
        key: "h2h",
        fixture: "rated",
        label: "Head-to-head open, a rated friend (both provisional)",
        ctx: { friend: "othmane" },
      },
      {
        key: "h2h-forming",
        fixture: "rated",
        label: "Head-to-head open, a friend still forming (2/3): dashes, never 0",
        ctx: { friend: "hamza" },
      },
      {
        key: "h2h-dash",
        fixture: "rated",
        label: "Head-to-head open, a friend with one empty stat (TRF)",
        ctx: { friend: "salma" },
      },
    ],
    render(env) {
      const open = env.v.key.startsWith("h2h");
      return leaguePage(env, open ? h2hSheet(env, leagueOf(env)) : "");
    },
  });

  /* ---------- S11 · the share sheet and the image ---------- */
  /** The hub with the first-rating hero: the screen "Partager" was tapped on, under the scrim. */
  const hubBehind = (env) => {
    const sk = ONB.skeleton;
    const p = env.p;
    const hero = ONB.hero(
      `<div class="m56-hhero">${env.card("full", { width: 132 })}` +
        `<div class="m56-hcol"><bdi dir="ltr" class="m56-hovr"><span class="onb-t-score-hero">${p.ovr}</span><span class="onb-t-sub">OVR</span></bdi>` +
        `<span class="onb-t-section">${esc(env.tier(p.tier))}</span>${ONB.provisionalChip(env)}</div></div>` +
        `<p class="onb-t-secondary onb-muted" style="margin-block:12px">${env.t(K + "m4.hero.fresh.line")}</p>` +
        ONB.btnRow(
          ONB.button(env.t(K + "m4.hero.detail"), { kind: "primary" }),
          ONB.button(env.t(K + "m4.hero.share"), { kind: "soft" }),
        ),
      env,
      {
        label: env.t(K + "m4.hero.fresh.label", { gw: env.ctx.firstRatedGw }),
        closeLabel: env.text("app.close"),
      },
    );
    return (
      sk.hubAbove(env) +
      `<div class="onb-flow" style="margin-block-start:14px">${hero}</div>` +
      `<div style="margin-block-start:24px">${sk.hubBelow(env)}</div>`
    );
  };

  /** The message in « tu », numbers isolated; the league's name when the manager has one. */
  const messageHTML = (env) => {
    const vars = { ovr: env.p.ovr, link: ONB.raw(`<bdi dir="ltr">${LINK}</bdi>`, LINK) };
    if (env.ctx.noLeague)
      return env.t(env.p.provisional ? K + "m6.msg.plain_prov" : K + "m6.msg.plain", vars);
    return env.t(K + "m6.msg.league", { ...vars, league: env.pick(LEAGUE_NAME) });
  };

  const shareSheet = (env) => {
    const btn = (kind, label, icon) =>
      `<button type="button" class="onb-btn onb-btn--${kind} onb-btn--full">${glyph(icon)}<span>${label}</span></button>`;
    const body =
      `<div class="m56 m56-share">` +
      `<div class="m56-msg"><div class="m56-msg__img">${env.card("share", { width: 232 })}</div>` +
      `<p class="m56-msg__text">${messageHTML(env)}</p></div></div>`;
    return ONB.sheet(body, env, {
      height: 0.94,
      title: env.t(K + "m4.sheet.share"),
      closeLabel: env.text("app.close"),
      footer:
        `<div class="m56-foot">${btn("primary", env.t(K + "m6.whatsapp"), "chat")}` +
        // inside the phone app or a browser that can share a file: « Partager l'image »; otherwise the download
        `${env.ctx.canShare === false ? btn("soft", env.t("app.share.download"), "download") : btn("soft", env.t(K + "m6.native"), "share")}` +
        `${btn("soft", env.t(K + "m6.copy"), "copy")}</div>`,
    });
  };

  ONB.screen({
    id: "S11",
    moment: "M6",
    title: "Share sheet and the 1080 x 1920 image",
    variants: [
      {
        key: "sheet",
        fixture: "rated",
        label: "Share sheet over the hub: the message names the league (tu)",
      },
      {
        key: "sheet-solo",
        fixture: "rated",
        label: "Share sheet, a manager with no league: the plain message",
        ctx: { noLeague: true },
      },
      {
        key: "sheet-web",
        fixture: "rated",
        label: "Share sheet where the phone cannot share a file: a download in its place",
        ctx: { canShare: false },
      },
      {
        key: "image",
        fixture: "rated",
        label: "The share image at 360 x 640 (exports at 1080 x 1920), Provisoire on it",
      },
    ],
    render(env) {
      if (env.v.key === "image")
        return ONB.phone(
          `<div class="m56 m56-shot">${env.card("share", { width: 360 })}<p dir="ltr"><span class="onb-demo-flag">Share image · 1080 × 1920 · sample</span></p></div>`,
          env,
          { topbar: false, nav: false, gutter: false },
        );
      return ONB.phone(hubBehind(env), env, {
        tab: "fantasy",
        title: env.t("app.fantasy.title"),
        scrollTo: ".onb-hub-anchor",
        overlay: shareSheet(env),
      });
    },
  });
})();
