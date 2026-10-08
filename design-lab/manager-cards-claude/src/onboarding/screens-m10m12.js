/* S15 · season closed and a new season (M10), S16 · the card page, its history, the « Revoir » list
   and a replay (M12), S17 · edges (the deletion line, the offline card page, the feature off),
   S18 · the v2 three-frame story (M4c) and D1 · the desktop hub and card page.
   Every screen is the app's own screen with the card set in it: the hub (FantasyHub), the profile's
   deletion dialog (src/routes/profile.tsx, DeleteAccountSection), the Fantasy column at 1440 and the
   PepitesReveal shell for the story (src/components/pepites/PepitesReveal.tsx).
   Motion (motion=1 only, nothing under prefers-reduced-motion): the number, the serial and the card
   are in the first painted frame every time. The hero or the story's frame makes the app's one 8px
   enter-rise (transform only) and the object plays its own beat; nothing else moves, the line, the
   buttons and the rows included. A replay plays the object's own beat and nothing else.
   Every string comes from env.t(key); no heading carries the manager's name. */
(function () {
  const MC = window.MC;
  const ONB = MC && MC.ONB;
  if (!ONB || !ONB.screen) return;
  const K = "card.onboarding.";
  const esc = MC.esc;

  /* ---------- strings this file adds (copied from the plan or the app's dictionaries) ---------- */
  ONB.addStrings({
    fr: {
      // proposed: the plan names the story's forward step, not its word (the app's own "Suivant")
      [K + "m4.story.next"]: "Suivant",
      // composed from the app's own words (app.next_deadline) and the hub's gameweek and deadline
      [K + "m12.next"]: "Prochaine date limite : J{gw} · {deadline}",
      "app.profile.section.account": "Compte",
      "app.profile.section.legal": "Informations légales",
      "app.profile.section.help": "Aide et contact",
      "app.profile.section.danger": "Supprimer le compte",
      "app.profile.change_password": "Changer le mot de passe",
      "app.profile.mfa_setup": "Authentification à deux facteurs",
      "app.profile.help_rules": "Aide & Règles",
      "app.profile.sign_out": "Se déconnecter",
      "app.profile.legal.terms": "Conditions d'utilisation",
      "app.profile.legal.privacy": "Politique de confidentialité",
      "app.profile.contact": "Nous contacter",
      "app.delete.kept":
        "Seuls la trace des lots déjà remis (5 ans) et les journaux de sécurité (12 mois) sont gardés, détachés du compte.",
      "app.delete.learn_more": "Tout savoir sur la suppression",
    },
    ar: {
      [K + "m4.story.next"]: "التالي",
      [K + "m12.next"]: "الموعد النهائي القادم: الجولة {gw} · {deadline}",
      "app.profile.section.account": "الحساب",
      "app.profile.section.legal": "المعلومات القانونية",
      "app.profile.section.help": "المساعدة والتواصل",
      "app.profile.section.danger": "حذف الحساب",
      "app.profile.change_password": "تغيير كلمة المرور",
      "app.profile.mfa_setup": "المصادقة الثنائية",
      "app.profile.help_rules": "المساعدة والقواعد",
      "app.profile.sign_out": "تسجيل الخروج",
      "app.profile.legal.terms": "شروط الاستخدام",
      "app.profile.legal.privacy": "سياسة الخصوصية",
      "app.profile.contact": "اتصل بنا",
      "app.delete.kept":
        "لا نحتفظ إلا بأثر الجوائز المسلَّمة (5 سنوات) وسجلات الأمان (12 شهراً)، منفصلة عن الحساب.",
      "app.delete.learn_more": "كل ما يخص حذف الحساب",
    },
  });

  /* ---------- styles ---------- */
  ONB.style(
    "m10m12",
    `
/* ---------- the reading of a number: "84 OVR" is one unit, Changa 800, OVR inline (lab rule 6) ---------- */
.onb .m12-ovr { display: inline-flex; align-items: baseline; gap: 6px; direction: ltr; unicode-bidi: isolate; color: var(--ui-on-surface); white-space: nowrap; }
.onb .m12-ovr__n { font: 800 76px/0.92 var(--onb-display); font-variant-numeric: lining-nums; }
.onb .m12-ovr__u { font: 800 20px/1 var(--onb-display); color: var(--ui-ink-fg); }
.onb .m12-ovr--md .m12-ovr__n { font-size: 52px; }
.onb .m12-ovr--md .m12-ovr__u { font-size: 17px; }
.onb .m12-ovr--sm .m12-ovr__n { font-size: 40px; line-height: 1; }
.onb .m12-ovr--sm .m12-ovr__u { font-size: 15px; }
.onb .m12-tier { margin-block-start: 4px; font: 800 26px/1.15 var(--onb-display); color: var(--ui-ink-fg); }
.onb[dir="ltr"] .m12-tier { letter-spacing: 0.02em; }
.onb .m12-tier--sm { margin-block-start: 0; font-size: 17px; }

/* ---------- the hero (S15 closed, D1): card at the start, the reading at the end, a line, two buttons ---------- */
.onb .m12-hero .onb-hero__label { text-wrap: balance; }
.onb .m12-main { display: flex; align-items: center; gap: 16px; margin-block-start: 6px; }
.onb .m12-main > .onb-card { flex: none; }
.onb .m12-read { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }
.onb .m12-read .onb-chip { margin-block-start: 14px; }
.onb .m12-line { margin-block-start: 14px; color: var(--ui-on-surface-muted); font: 600 14px/var(--ui-leading-copy) var(--onb-body); text-wrap: pretty; }
.onb .m12-more .onb-btnrow { margin-block-start: 14px; }
.onb-desktop .m12-more .onb-btnrow { grid-template-columns: repeat(2, minmax(0, 200px)); justify-content: start; }
/* At 1440 the hero uses the column: the card at the start spans the rows, the reading, the line and the buttons stack beside it. */
.onb-desktop .m12-hero { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 28px; align-items: start; }
.onb-desktop .m12-hero .onb-hero__top { grid-column: 1 / -1; }
.onb-desktop .m12-hero .m12-main { display: contents; }
.onb-desktop .m12-hero .m12-main > .onb-card { grid-column: 1; grid-row: 2 / span 2; }
.onb-desktop .m12-hero .m12-read { grid-column: 2; grid-row: 2; align-self: end; }
.onb-desktop .m12-hero .m12-more { grid-column: 2; grid-row: 3; align-self: start; }

/* The closing hero's enter-rise (motion=1 only): the whole hero settles 8px (transform only, the app's
   enter-rise without its fade); the card, the number, the line and the buttons are there from frame 0. */
@media (prefers-reduced-motion: no-preference) {
  .onb .m12-live { animation: m12-rise 260ms cubic-bezier(0, 0, 0.2, 1) both; }
}
@keyframes m12-rise { from { transform: translateY(8px); } to { transform: none; } }

/* ---------- the new season's block (S15 started): the M3 block, the counter, last season's number kept ---------- */
.onb .m12-block { display: flex; flex-direction: column; gap: 12px; width: 100%; min-height: 120px; padding: 16px; text-align: start; }
.onb .m12-block__row { display: flex; align-items: center; gap: 12px; }
.onb .m12-block__count { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.onb .m12-prev { flex: none; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding-inline-start: 12px; border-inline-start: 1px solid var(--ui-rule); }
.onb .m12-prev__season { color: var(--ui-on-surface-muted); font: 800 12px/var(--ui-leading-flat) var(--onb-body); direction: ltr; unicode-bidi: isolate; }
.onb .m12-prev .m12-ovr--sm .m12-ovr__n { font-size: 36px; }
.onb .m12-prev .m12-tier { margin-block-start: 0; font-size: 15px; }

/* ---------- the card page (S16, D1): the card, its reading, the stats, the history, « Revoir » ---------- */
.onb .m12-page { display: flex; flex-direction: column; align-items: center; text-align: center; }
.onb .m12-page > * { max-width: 100%; }
.onb .m12-page .onb-btn { width: 100%; }
.onb .m12-rating { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px 12px; }
.onb .m12-rating .onb-chip { align-self: center; }
.onb .m12-rating .m12-tier { margin-block-start: 0; font-size: 17px; }
.onb .m12-state { color: var(--ui-on-surface-muted); text-wrap: balance; max-width: 30em; }
.onb .m12-tiles { width: 100%; text-align: start; }
/* The four tiles: UiStatBlock as a 64px row, the long label at the start, the figure at the end (as S09). */
.onb .m12-tile { flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; min-height: 64px; padding: 8px 12px; }
.onb .m12-tile__t { display: flex; flex-direction: column; min-width: 0; }
.onb .m12-code { font: 800 13px/1.3 var(--onb-body); color: var(--ui-ink-fg); }
.onb .m12-long { font: 600 12px/1.35 var(--onb-body); color: var(--ui-on-surface-muted); text-wrap: balance; }
.onb .m12-why { font: 600 11px/1.4 var(--onb-body); color: var(--ui-on-surface-muted); text-wrap: balance; }
.onb[dir="rtl"] .m12-code, .onb[dir="rtl"] .m12-long, .onb[dir="rtl"] .m12-why { line-height: 1.6; }
.onb .m12-tile__v { flex: none; line-height: 1.2; }
.onb .m12-foot { width: 100%; text-align: start; }
.onb .m12-lower { width: 100%; text-align: start; }
.onb .m12-replays { margin-block-start: 24px; }
.onb-desktop .m12-lower { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
.onb-desktop .m12-replays { margin-block-start: 0; }
.onb .m12-hist__v { font-variant-numeric: tabular-nums; }
.onb .m12-hist__first { font-weight: 800; }
.onb .m12-replay-row .onb-disc { color: var(--ui-ink-fg); }
.onb .m12-bleed { margin: -14px -16px 14px; }

/* The replay sheet: the stored values stamped with their round, the current number in the first line. */
.onb .m12-rp { display: flex; flex-direction: column; align-items: center; gap: 10px; padding-block: 2px 8px; text-align: center; }
.onb .m12-rp .onb-chip { align-self: center; }
.onb .m12-rp__line { color: var(--ui-on-surface); font: 800 17px/var(--ui-leading-flat) var(--onb-body); }
.onb .m12-rp__card { position: relative; display: flex; justify-content: center; width: 100%; }
.onb .m12-rp__beat { position: absolute; inset-inline-end: -6px; inset-block-end: -4px; gap: 4px; max-width: 84px; padding-inline: 8px; line-height: 1.25; }
.onb .m12-rp__beat span { text-wrap: balance; }
@media (prefers-reduced-motion: reduce) { .onb .m12-rp__beat { display: none; } }

/* ---------- the deletion dialog over the profile (S17), UiModal's anatomy ---------- */
.onb .m12-modalwrap { align-items: center; justify-content: center; padding: 16px; }
.onb .m12-modal { display: flex; flex-direction: column; width: min(100%, 26rem); max-height: 100%; overflow: hidden; border-radius: var(--ui-radius-sheet); background: var(--ui-surface); color: var(--ui-on-surface); box-shadow: var(--ui-shadow-overlay); }
.onb .m12-modal__head { display: flex; align-items: flex-start; gap: 12px; padding: 16px 12px 0 16px; }
.onb[dir="rtl"] .m12-modal__head { padding: 16px 16px 0 12px; }
.onb .m12-modal__body { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px; overflow-y: auto; scrollbar-width: none; }
.onb .m12-modal__foot { display: flex; flex-direction: column; gap: 8px; padding: 4px 16px 16px; }
.onb .m12-cardline { padding: 10px 12px; border-radius: var(--ui-radius-control); background: var(--ui-surface-sunken); color: var(--ui-on-surface); font: 600 14px/var(--ui-leading-copy) var(--onb-body); text-wrap: pretty; }
.onb .m12-nb { white-space: nowrap; }
.onb .m12-learn { margin-block-start: -6px; display: inline-flex; align-items: center; align-self: flex-start; min-height: 44px; color: var(--ui-ink-fg); font: 800 13px/var(--ui-leading-copy) var(--onb-body); text-decoration: underline; text-underline-offset: 2px; }
.onb .m12-check { display: flex; align-items: flex-start; gap: 12px; width: 100%; min-height: 56px; padding: 12px; border-radius: var(--ui-radius-card); border: 1px solid color-mix(in oklab, var(--ui-negative) 30%, transparent); background: color-mix(in oklab, var(--ui-negative) 7%, transparent); font: 600 13px/var(--ui-leading-copy) var(--onb-body); text-align: start; }
.onb .m12-check__box { flex: none; width: 18px; height: 18px; margin-block-start: 3px; border: 2px solid var(--ui-on-surface-muted); border-radius: 4px; background: var(--ui-surface); }
.onb .m12-ghost { background: transparent; color: var(--ui-ink-fg); }
/* The profile page behind it (the part the deletion row sits in). */
.onb .m12-group + .m12-group { margin-block-start: 24px; }
.onb .m12-neg { color: var(--ui-negative); }
.onb .m12-disc--neg { background: color-mix(in oklab, var(--ui-negative) 14%, transparent); color: var(--ui-negative); }
.onb .m12-danger { overflow: hidden; border-radius: var(--ui-radius-card); border: 1px solid color-mix(in oklab, var(--ui-negative) 30%, transparent); background: color-mix(in oklab, var(--ui-negative) 6%, var(--ui-surface)); box-shadow: var(--ui-card-shadow); }
.onb .m12-danger .onb-listrow { border: 0; }

/* ---------- the offline card page (S17): the app's error panel, one action ---------- */
.onb .m12-error { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px; text-align: center; }
.onb .m12-error .onb-ico { color: var(--ui-negative); }
.onb .m12-error h2 { text-wrap: balance; }
.onb .m12-error .onb-btn { margin-block-start: 4px; min-width: 160px; }

/* ---------- the three-frame story (S18): the PepitesReveal shell ---------- */
.onb .m18 { display: flex; flex-direction: column; min-height: 782px; }
.onb .m18-progress { display: flex; gap: 4px; margin-block-start: 2px; list-style: none; padding: 0; }
.onb .m18-progress li { flex: 1 1 0; height: 4px; border-radius: 999px; background: var(--ui-surface-sunken); }
.onb .m18-progress li.is-on { background: var(--ui-ink-fg); }
.onb .m18-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-block-start: 12px; }
.onb .m18-stamp { min-width: 0; text-align: end; }
.onb .m18-stage { flex: 1 1 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; }
.onb .m18-stage--top { justify-content: flex-start; align-items: stretch; text-align: start; padding-block-start: 20px; gap: 14px; }
.onb .m18-number { display: flex; justify-content: center; margin-block-start: 6px; }
.onb .m18-tierrow { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px 12px; }
.onb .m18-tierrow .m12-tier { margin-block-start: 0; }
.onb .m18-tierrow .onb-chip { align-self: center; }
.onb .m18-h { font: 800 28px/var(--ui-leading-display) var(--onb-display); text-wrap: balance; }
.onb .m18-head { display: flex; align-items: center; gap: 14px; }
.onb .m18-tiles .m12-tile { min-height: 104px; padding: 14px 12px; }
.onb .m18-tiles .m12-tile__v { font-size: 34px; }
.onb .m18 .onb-btnrow { margin-block-start: 20px; }
.onb .m18-rank { overflow: hidden; border-radius: var(--ui-radius-card); background: var(--ui-surface); box-shadow: var(--ui-card-shadow); }
.onb .m18-rank .app-rank-row { min-height: 72px; }
.onb .m18-rank .app-rank-pts { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1; }
.onb .m18-rank .app-rank-pts small { color: var(--ui-on-surface-muted); font: 600 11px/1.4 var(--onb-body); }
.onb .m18-rank .app-rank-name b { font-weight: 800; }
/* The frame makes the one 8px enter-rise (transform only); frame 1's card plays its own beat inside it. */
@media (prefers-reduced-motion: no-preference) {
  .onb .m18-live .m18-stage { animation: m18-rise 260ms cubic-bezier(0, 0, 0.2, 1) both; }
}
@keyframes m18-rise { from { transform: translateY(8px); } to { transform: none; } }
`,
  );

  /* ---------- icons this file needs (lucide paths, the kit's stroke) ---------- */
  const svg = (d, cls = "", size = 20) =>
    `<svg class="onb-ico${cls ? " " + cls : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICO = {
    replay: (s) =>
      svg(
        '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
        "",
        s,
      ),
    next: () => svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', "onb-ico--dir", 18),
    key: () =>
      svg(
        '<path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
      ),
    shield: () =>
      svg(
        '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
      ),
    shieldCheck: () =>
      svg(
        '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
      ),
    logout: () =>
      svg(
        '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
      ),
    file: () =>
      svg(
        '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
      ),
    mail: () =>
      svg(
        '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
      ),
    trash: () =>
      svg(
        '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
      ),
  };

  /* ---------- pieces shared by the screens ---------- */
  const mark = (env, n, size) =>
    `<bdi dir="ltr" class="m12-ovr${size ? " m12-ovr--" + size : ""}"><span class="m12-ovr__n">${n == null ? ONB.dash : esc(n)}</span><span class="m12-ovr__u">${esc(MC.s(env.o).ovr)}</span></bdi>`;
  const tierWord = (env, tier, cls = "") =>
    `<span class="m12-tier${cls ? " " + cls : ""}">${esc(env.tier(tier))}</span>`;

  /** The card's token. Its slot (.onb-card--token) is as wide as the art and never shrinks, so a goal or a sole sits beside text without overlapping it. */
  const tok = (env, size, opts) => env.card("token", { size, ...opts });

  /** The hub: the app's own blocks, the card block set right under Valeur / Banque / Rang. */
  const hubScreen = (env, block, extra = {}) => {
    const sk = ONB.skeleton;
    return ONB.phone(
      sk.hubAbove(env) +
        `<div style="margin-block-start:14px">${block}</div>` +
        `<div style="margin-block-start:24px">${sk.hubBelow(env)}</div>`,
      env,
      { tab: "fantasy", title: env.t("app.fantasy.title"), scrollTo: ".onb-hub-anchor", ...extra },
    );
  };

  /** A hero: label and 44px close; the card and its reading; one line; two buttons. */
  const heroBlock = (env, { label, read, line, primary, secondary, beat, width = 132, live }) =>
    ONB.hero(
      `<div class="m12-main">${env.card("full", { width, beat })}<div class="m12-read">${read}</div></div>` +
        `<div class="m12-more">${line ? `<p class="m12-line">${line}</p>` : ""}` +
        ONB.btnRow(
          ONB.button(primary, { kind: "primary" }),
          ONB.button(secondary, { kind: "soft" }),
        ) +
        `</div>`,
      env,
      { label, cls: "m12-hero" + (live && env.o.motion ? " m12-live" : "") },
    );

  /** The first-rating hero (M4a), as the hub shows it: the same anatomy as S08. */
  const firstRatingHero = (env, width) => {
    const p = env.p;
    return heroBlock(env, {
      label: env.t(K + "m4.hero.fresh.label", { gw: env.ctx.firstRatedGw }),
      read:
        mark(env, p.ovr) + tierWord(env, p.tier) + (p.provisional ? ONB.provisionalChip(env) : ""),
      line: p.provisional ? env.t(K + "m4.hero.fresh.line") : "",
      primary: env.t(K + "m4.hero.detail"),
      secondary: env.t(K + "m4.hero.share"),
      beat: "first",
      width,
    });
  };

  /** One stat tile, as the detail sheet draws it: code and long label at the start, the figure at the end. */
  const statRow = (env, k) => {
    const p = env.p;
    const v = p.stats[k];
    const why = p.statReason && p.statReason[k];
    const reason =
      v == null && why ? env.t(K + (k === "TRF" ? "state.trf." : "state.reason.") + why) : "";
    const [code, ...rest] = env.t(K + "m4.sheet.tile." + k.toLowerCase()).split(" · ");
    return (
      `<div class="onb-stat m12-tile"><span class="m12-tile__t">` +
      `<span class="m12-code">${code}</span>` +
      (rest.length ? `<span class="m12-long">${rest.join(" · ")}</span>` : "") +
      (reason ? `<span class="m12-why">${reason}</span>` : "") +
      `</span><span class="onb-t-stat m12-tile__v">${v == null ? ONB.dash : ONB.num(v, env)}</span></div>`
    );
  };

  /* ============================================================================================
     S15 · season closed (a hero) and the new season (the M3 block with last season's number)
     ============================================================================================ */
  const closedHero = (env) => {
    const p = env.p;
    // The plan's one sentence, read as a headline and a line: "Saison 2026/27 terminée : 86, PRO." and
    // "Elle reste sur votre carte." (split at the first full stop; no copy is added).
    const [head, ...rest] = env.t(K + "m10.closed").split(/(?<=\.)\s+/);
    return heroBlock(env, {
      label: head,
      read: mark(env, p.ovr) + tierWord(env, p.tier),
      line: rest.join(" "),
      primary: env.t(K + "m8.view"),
      secondary: env.t(K + "m4.hero.share"),
      live: true,
    });
  };

  /** M10 season_started: the M3 block, the new counter beside last season's number, labelled with its season. */
  const startedBlock = (env) => {
    const p = env.p;
    const prev = env.ctx.previousSeason;
    return (
      `<button type="button" class="onb-surface m12-block">` +
      `<span class="m12-block__row">${tok(env, 64)}` +
      `<span class="m12-block__count"><span class="onb-t-score">${env.t(K + "m3.counter", { k: p.counted })}</span>` +
      `<span class="onb-t-strong">${env.t(K + "m3.label")}</span></span>` +
      `<span class="m12-prev"><span class="m12-prev__season">${esc(prev.season)}</span>` +
      mark(env, prev.ovr, "sm") +
      tierWord(env, prev.tier, "m12-tier--sm") +
      `</span></span>` +
      `<span class="onb-t-meta onb-muted">${env.t(K + "m10.started", { prev: prev.season })}</span>` +
      `</button>`
    );
  };

  ONB.screen({
    id: "S15",
    moment: "M10",
    title: "Season closed hero and the new season's block",
    variants: [
      {
        key: "closed",
        fixture: "seasonClosed",
        label: "Season 2026/27 closed: the hub hero, once (86, it stays on the card)",
        ctx: { nextGw: 1 },
      },
      {
        key: "started",
        fixture: "seasonStarted",
        label: "Season 2027/28: counter 0/3 and last season's 86 labelled 2026/27, never a dash",
      },
    ],
    render: (env) => hubScreen(env, env.v.key === "closed" ? closedHero(env) : startedBlock(env)),
  });

  /* ============================================================================================
     S16 · the card page: the card, its rating, the stats, the history, « Revoir »; and a replay
     ============================================================================================ */

  /** The history, newest first: one row per evaluated gameweek, a dash while the rating was still forming. */
  const historyOf = (env) => {
    if (env.ctx.history) return env.ctx.history;
    const p = env.p;
    const first = env.ctx.firstRatedGw;
    const gws = env.ctx.ratingGws || [];
    const rows = [
      { gw: env.ctx.latestGw, ovr: p.ovr, tier: p.tier, provisional: p.provisional, first: true },
    ];
    gws
      .filter((g) => g < first)
      .reverse()
      .forEach((g) => rows.push({ gw: g, ovr: null, k: gws.indexOf(g) + 1 }));
    return rows;
  };

  const historySection = (env) => {
    const p = env.p;
    const rows = historyOf(env).map((h) => {
      const title = h.first ? env.t(K + "m4.hero.fresh.label", { gw: h.gw }) : env.gw(h.gw);
      const sub =
        h.ovr == null
          ? env.t(K + "m5.row.forming", { k: h.k, n: p.minRated })
          : esc(env.tier(h.tier)) + (h.provisional ? " · " + env.t(K + "common.provisional") : "");
      return ONB.row({
        title: h.first ? `<span class="m12-hist__first">${title}</span>` : title,
        sub,
        trail: `<span class="onb-t-stat m12-hist__v">${h.ovr == null ? ONB.dash : ONB.num(h.ovr, env)}</span>`,
      });
    });
    return `<div class="m12-history">${ONB.section(env.t(K + "m12.history"), ONB.list(rows))}</div>`;
  };

  /** « Revoir »: only moments that happened. A row opens the replay (the sheet), never by itself. */
  const replayItems = (env) => {
    const items = [];
    if (env.ctx.firstRatedGw != null)
      items.push(env.t(K + "m12.item.first_rating", { gw: env.ctx.firstRatedGw }));
    if (env.p.founder) items.push(env.t(K + "m12.item.founder"));
    return items;
  };
  const replaySection = (env) => {
    const rows = replayItems(env).map((text) =>
      ONB.row({
        tag: "button",
        cls: "m12-replay-row",
        attrs: 'aria-haspopup="dialog"',
        lead: `<span class="onb-disc">${ICO.replay(18)}</span>`,
        title: text,
        chevron: true,
      }),
    );
    return `<div class="m12-replays">${ONB.section(env.t(K + "m12.replay"), ONB.list(rows))}</div>`;
  };

  const cardPageBody = (env, { wide = false } = {}) => {
    const p = env.p;
    const rated = p.ovr != null;
    const deadline = env.t(K + "m12.next", { gw: env.ctx.nextGw });
    const reading = rated
      ? `<div class="m12-rating">${mark(env, p.ovr, "sm")}${tierWord(env, p.tier, "m12-tier--sm")}${p.provisional ? ONB.provisionalChip(env) : ""}</div>`
      : `<div class="m12-rating"><span class="onb-t-score">${env.t(K + "m3.counter", { k: p.counted })}</span><span class="onb-t-strong">${env.t(K + "m3.label")}</span></div>`;
    return (
      `<div class="m12-page onb-flow" style="--gap:12px">` +
      `<div>${env.card("full", { width: wide ? 240 : 208 })}</div>` +
      `<div class="onb-flow" style="--gap:6px">${reading}` +
      (rated && p.provisional
        ? `<p class="onb-t-secondary m12-state">${env.t(K + "m4.hero.fresh.line")}</p>`
        : "") +
      `<p class="onb-t-meta onb-muted">${deadline}</p></div>` +
      ONB.button(env.t(K + "m4.hero.share"), { kind: "primary", full: true }) +
      `<div class="onb-grid2 m12-tiles">${["CAP", "SEL", "TRF", "CON"].map((k) => statRow(env, k)).join("")}</div>` +
      `<p class="onb-t-meta onb-muted m12-foot">${env.t(K + "m4.sheet.footer")}</p>` +
      `<div class="m12-lower">${historySection(env)}${replaySection(env)}</div>` +
      `</div>`
    );
  };

  /** The replay (frame 1): that gameweek's stored values with its round, the current number in the first line. */
  const replaySheet = (env) => {
    const stored = ONB.FIX.rated.profile;
    const gw = env.ctx.firstRatedGw;
    const beatEnv = { ...env, o: { ...env.o, motion: true } };
    const live = ONB.card(beatEnv, "full", { width: 176, beat: "first", p: stored });
    return ONB.sheet(
      `<div class="m12-rp" data-m12-scope>` +
        `<p class="m12-rp__line">${env.t(K + "m12.replay.line", { gw, then: stored.ovr, now: env.p.ovr })}</p>` +
        (stored.provisional ? ONB.provisionalChip(env) : "") +
        `<div class="m12-rp__card"><div data-m12-card>${env.card("full", { width: 176, p: stored })}</div>` +
        `<button type="button" class="onb-btn onb-btn--text m12-rp__beat" data-m12-replay>${ICO.replay(16)}<span>${env.t(K + "m12.replay")}</span></button>` +
        `<template data-m12-beat>${live}</template></div>` +
        `</div>`,
      env,
      {
        height: 0.88,
        title: env.t(K + "m4.hero.fresh.label", { gw }),
        footer: ONB.button(env.t(K + "m8.view"), { kind: "primary", full: true }),
      },
    );
  };

  // « Revoir » replays the object's beat again, number visible throughout: the card is kept in a template
  // and swapped in on the tap, which restarts the CSS beat. Never automatic.
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-m12-replay]");
    if (!b) return;
    const scope = b.closest("[data-m12-scope]");
    const slot = scope && scope.querySelector("[data-m12-card]");
    const tpl = scope && scope.querySelector("template[data-m12-beat]");
    if (slot && tpl) slot.innerHTML = tpl.innerHTML;
  });

  // Three rounds on from the `rated` fixture: J10, 87, no longer provisional (J9 reached five rounds).
  const LATER = {
    profile: {
      ovr: 87,
      provisional: false,
      counted: 6,
      stats: { CAP: 93, SEL: 85, TRF: 88, CON: 82 },
    },
    ctx: {
      latestGw: 10,
      nextGw: 11,
      history: [
        { gw: 10, ovr: 87, tier: "PRO", provisional: false },
        { gw: 9, ovr: 85, tier: "PRO", provisional: false },
        { gw: 8, ovr: 84, tier: "PRO", provisional: true },
        { gw: 7, ovr: 84, tier: "PRO", provisional: true, first: true },
        { gw: 6, ovr: null, k: 2 },
        { gw: 5, ovr: null, k: 1 },
      ],
    },
  };

  ONB.screen({
    id: "S16",
    moment: "M12",
    title: "Card page: history, « Revoir » and a replay",
    variants: [
      {
        key: "page",
        fixture: "rated",
        label: "The card page right after the first rating (84, Provisoire)",
        ctx: { nextGw: 8 },
      },
      {
        key: "history",
        fixture: "rated",
        label: "Three rounds on (J10, 87): the history, newest first, and « Revoir »",
        ...LATER,
      },
      {
        key: "replay",
        fixture: "rated",
        label: "Replay frame 1: J7's stored 84 and its round, today's 87 in the first line",
        ...LATER,
      },
    ],
    render: (env) =>
      ONB.phone(cardPageBody(env), env, {
        tab: "fantasy",
        back: true,
        title: env.t(K + "m2.heading"),
        scrollTo: env.v.key === "history" ? ".m12-history" : undefined,
        overlay: env.v.key === "replay" ? replaySheet(env) : "",
      }),
  });

  /* ============================================================================================
     S17 · edges: the deletion line, the offline card page, the feature off
     ============================================================================================ */
  const profileRow = (env, icon, label, { tone, value } = {}) =>
    ONB.row({
      tag: "button",
      lead: `<span class="onb-disc${tone === "negative" ? " m12-disc--neg" : ""}">${icon}</span>`,
      title: tone === "negative" ? `<span class="m12-neg">${label}</span>` : label,
      trail: value ? `<span class="onb-t-meta onb-muted">${value}</span>` : "",
      chevron: true,
    });
  const profileGroup = (title, inner) =>
    `<section class="onb-section m12-group"><header><h2 class="onb-t-section">${title}</h2></header>${inner}</section>`;

  /** The bottom of /profile, down to the danger zone's row that opens the dialog. */
  const profileLower = (env) => {
    const T = (k) => env.t("app.profile." + k);
    return (
      profileGroup(
        T("section.account"),
        ONB.list([
          profileRow(env, ICO.key(), T("change_password")),
          profileRow(env, ICO.shieldCheck(), T("mfa_setup")),
          profileRow(env, ONB.icon("info"), T("help_rules")),
          profileRow(env, ICO.logout(), T("sign_out"), { tone: "negative" }),
        ]),
      ) +
      profileGroup(
        T("section.legal"),
        ONB.list([
          profileRow(env, ICO.file(), T("legal.terms")),
          profileRow(env, ICO.shield(), T("legal.privacy")),
        ]),
      ) +
      profileGroup(
        T("section.help"),
        ONB.list([
          profileRow(env, ICO.mail(), T("contact"), { value: MC.ltr("support@botolago.com") }),
        ]),
      ) +
      profileGroup(
        T("section.danger"),
        `<div class="m12-danger">` +
          ONB.row({
            tag: "button",
            lead: `<span class="onb-disc m12-disc--neg">${ICO.trash()}</span>`,
            title: `<span class="m12-neg">${env.t("app.delete.title")}</span>`,
            sub: env.t("app.delete.desc"),
            chevron: true,
          }) +
          `</div>`,
      )
    );
  };

  /** UiModal as the tap on "Supprimer mon compte" opens it, with the card's line (serial part only when set). */
  const deletionDialog = (env) => {
    const id = MC.uid("onb-d");
    // The serial is one unit: it never breaks between "BOT" and its number, in either language.
    const serial = env.p.id
      ? ONB.raw(`<bdi dir="ltr" class="m12-nb">${esc(env.p.id)}</bdi>`, env.p.id)
      : null;
    const line = serial
      ? env.t(K + "state.deletion", { serial })
      : env.t(K + "state.deletion_noserial");
    return (
      `<div class="onb-overlay m12-modalwrap"><section class="m12-modal" role="dialog" aria-modal="true" aria-labelledby="${id}">` +
      `<div class="m12-modal__head"><div class="onb-grow"><h2 id="${id}" class="onb-t-section">${env.t("app.delete.confirm_title")}</h2>` +
      `<p class="onb-t-secondary onb-muted" style="margin-block-start:4px">${env.t("app.delete.confirm_body")}</p></div>` +
      ONB.closeButton(env, env.text("app.close")) +
      `</div>` +
      `<div class="m12-modal__body"><p class="m12-cardline">${line}</p>` +
      `<p class="onb-t-meta onb-muted">${env.t("app.delete.kept")}</p>` +
      `<a href="#" class="m12-learn" onclick="return false">${env.t("app.delete.learn_more")}</a>` +
      `<button type="button" role="checkbox" aria-checked="false" class="m12-check"><span class="m12-check__box" aria-hidden="true"></span><span>${env.t("app.delete.checkbox")}</span></button>` +
      `</div>` +
      `<div class="m12-modal__foot">` +
      ONB.button(env.t("app.delete.cta"), {
        kind: "soft",
        full: true,
        cls: "m12-destructive",
        attrs: 'disabled aria-disabled="true"',
      }) +
      ONB.button(env.t("app.delete.cancel"), { kind: "soft", full: true, cls: "m12-ghost" }) +
      `</div></section></div>`
    );
  };

  /** The card page when the read fails: the app's error panel with the plan's sentence and one action. */
  const offlinePage = (env) =>
    ONB.phone(
      `<section class="onb-surface m12-error" role="alert">${ONB.icon("alert", { size: 28 })}` +
        `<h2 class="onb-t-section">${env.t(K + "state.offline.text")}</h2>` +
        ONB.button(env.t(K + "state.offline.retry"), { kind: "ink" }) +
        `</section>`,
      env,
      { tab: "fantasy", back: true, title: env.t(K + "m2.heading") },
    );

  ONB.screen({
    id: "S17",
    moment: "edges",
    title: "Edges: deletion line, offline card page, feature off",
    variants: [
      {
        key: "deletion",
        fixture: "rated",
        label: "Profile deletion dialog, after the tap: the card line with its serial",
      },
      {
        key: "deletionNoSerial",
        fixture: "rated",
        label: "Same dialog, serial null: the line without the serial part",
        profile: { serial: null, id: null },
      },
      {
        key: "offline",
        fixture: "offline",
        label: "Card page, the read failed: the plan's sentence and « Réessayer », no stale number",
      },
      {
        key: "featureOff",
        fixture: "featureOff",
        label: 'Feature off: the hub exactly as today, no card, no "coming soon"',
        ctx: { nextGw: 8 },
      },
    ],
    render(env) {
      const k = env.v.key;
      if (k === "offline") return offlinePage(env);
      if (k === "featureOff") {
        const sk = ONB.skeleton;
        return ONB.phone(
          // the real hub goes on below (reminders, "more about"): the room keeps the same scroll as the block screens
          sk.hubAbove(env) + `<div style="margin-block:24px 380px">${sk.hubBelow(env)}</div>`,
          env,
          { tab: "fantasy", title: env.t("app.fantasy.title"), scrollTo: ".onb-hub-anchor" },
        );
      }
      return ONB.phone(profileLower(env), env, {
        tab: "profile",
        title: env.t("app.profile.title"),
        scrollTop: 9999,
        overlay: deletionDialog(env),
      });
    },
  });

  /* ============================================================================================
     S18 · v2 only, if measured: the three-frame story (the PepitesReveal shell)
     ============================================================================================ */
  /** The league's rows in the league's own points order (never re-sorted by OVR), the manager's own highlighted. */
  const leagueRows = (env) => {
    const by = Object.fromEntries(MC.SAMPLES.map((s) => [s.key, s]));
    const other = (key, over) =>
      Object.freeze({
        ...MC.sample(by[key]),
        founder: null,
        serial: null,
        id: null,
        counted: 5,
        minRated: 3,
        minFinal: 5,
        provisional: false,
        ...over,
      });
    return [
      { p: other("yasmine"), pts: 1288 },
      { p: other("salma", { counted: 3, provisional: true }), pts: 1241 },
      { p: env.p, pts: 1196, me: true },
      { p: other("othmane"), pts: 1150 },
      { p: other("hamza", { ovr: null, tier: null, counted: 2 }), pts: 1097 },
    ];
  };

  const leagueRow = (env, r, i) => {
    const p = r.p;
    const S = MC.s(env.o);
    const sub =
      p.ovr == null
        ? env.t(K + "m5.row.forming", { k: p.counted, n: p.minRated })
        : MC.ltr(`${p.ovr} ${S.ovr}`) +
          (p.provisional ? " · " + env.t(K + "common.provisional") : "");
    return (
      `<div class="app-rank-row${r.me ? " is-me" : ""}">` +
      `<span class="app-rank-pos">${ONB.num(i + 1, env)}</span>` +
      `<span class="app-rank-token" style="--token-h:28px">${tok(env, 28, { p })}</span>` +
      `<span class="app-rank-name"><b>${esc(MC.nameOf(p, env.o))}</b><small>${sub}</small></span>` +
      `<span class="app-rank-pts">${ONB.num(r.pts, env)}<small>${env.t("app.points")}</small></span></div>`
    );
  };

  const storyFrame = (env, frame) => {
    const p = env.p;
    const gw = env.ctx.firstRatedGw;
    const progress =
      `<ol class="m18-progress" aria-label="${env.text(K + "m4.story.progress", { k: frame, n: 3 })}">` +
      [1, 2, 3]
        .map((i) => `<li aria-hidden="true"${i <= frame ? ' class="is-on"' : ""}></li>`)
        .join("") +
      `</ol>`;
    const top =
      `<div class="m18-top"><button type="button" class="onb-backpill">${ONB.icon("back")}<span>${env.t("app.back")}</span></button>` +
      `<p class="onb-t-label onb-muted m18-stamp">${env.t(K + "m4.hero.fresh.label", { gw })}</p></div>`;
    const share = ONB.button(env.t(K + "m4.hero.share"), { kind: "soft" });
    let stage;
    let primary;
    if (frame === 1) {
      stage =
        `<div class="m18-stage">${env.card("full", { width: 204, beat: "first" })}` +
        `<h1 class="m18-number">${mark(env, p.ovr, "md")}</h1>` +
        `<div class="m18-tierrow">${tierWord(env, p.tier)}${p.provisional ? ONB.provisionalChip(env) : ""}</div>` +
        `<p class="onb-t-secondary onb-muted">${env.t(K + "m4.hero.fresh.line")}</p></div>`;
      primary = ONB.button(env.t(K + "m4.story.next"), { kind: "primary", icon: null }).replace(
        "</span></button>",
        `</span>${ICO.next()}</button>`,
      );
    } else if (frame === 2) {
      stage =
        `<div class="m18-stage m18-stage--top"><div class="m18-head">${tok(env, 64)}` +
        `<h1 class="m18-h">${env.t(K + "m4.sheet.heading")}</h1></div>` +
        `<p class="onb-t-secondary onb-muted">${env.t(K + "m4.sheet.line")}</p>` +
        `<div class="onb-grid2 m18-tiles">${["CAP", "SEL", "TRF", "CON"]
          .map((k) => statRow(env, k))
          .join("")}</div>` +
        `<p class="onb-t-meta onb-muted">${env.t(K + "m4.sheet.footer")}</p></div>`;
      primary = ONB.button(env.t(K + "m4.story.next"), { kind: "primary", icon: null }).replace(
        "</span></button>",
        `</span>${ICO.next()}</button>`,
      );
    } else {
      stage =
        `<div class="m18-stage m18-stage--top"><h1 class="m18-h">${env.t("app.my_leagues")}</h1>` +
        `<div class="m18-rank">${leagueRows(env)
          .map((r, i) => leagueRow(env, r, i))
          .join("")}</div></div>`;
      primary = ONB.button(env.t(K + "m4.sheet.league"), { kind: "primary" });
    }
    return (
      `<div class="m18${env.o.motion ? " m18-live" : ""}">${progress}${top}${stage}` +
      ONB.btnRow(primary, share) +
      `</div>`
    );
  };

  ONB.screen({
    id: "S18",
    moment: "M4c",
    title: "v2, only if measured: the three-frame story (PepitesReveal shell)",
    variants: [
      { key: "frame1", fixture: "rated", label: "v2, only if measured · frame 1 of 3: the number" },
      { key: "frame2", fixture: "rated", label: "v2, only if measured · frame 2 of 3: the tiles" },
      { key: "frame3", fixture: "rated", label: "v2, only if measured · frame 3 of 3: the league" },
    ],
    render(env) {
      const frame = Number(env.v.key.slice(-1));
      return ONB.phone(storyFrame(env, frame), env, { topbar: false, nav: false, scroll: false });
    },
  });

  /* ============================================================================================
     D1 · desktop 1440: the Fantasy column under the wide top bar, the hub with the hero and the card page
     ============================================================================================ */
  /** UiHeader inside the column: the back pill and the centred title, as the inner screens draw it. */
  const innerHeader = (env, title) =>
    `<header class="onb-header m12-bleed"><div class="onb-header__row"><div><button type="button" class="onb-backpill">${ONB.icon("back")}<span>${env.t("app.back")}</span></button></div>` +
    `<h1 class="onb-header__title onb-t-header">${title}</h1><div class="onb-header__end"></div></div></header>`;

  ONB.screen({
    id: "D1",
    moment: "M4a, M12",
    desktop: true,
    title: "Desktop 1440: the hub with the hero, and the card page",
    variants: [
      {
        key: "hub",
        fixture: "rated",
        label:
          "The hub in the 672px Fantasy column, the first-rating hero under Valeur / Banque / Rang",
        ctx: { nextGw: 8 },
      },
      {
        key: "card",
        fixture: "rated",
        label: "The card page in the same column",
        ctx: { nextGw: 8 },
      },
    ],
    render(env) {
      if (env.v.key === "card")
        return ONB.desktop(
          innerHeader(env, env.t(K + "m2.heading")) + cardPageBody(env, { wide: true }),
          env,
          {
            tab: "fantasy",
          },
        );
      const sk = ONB.skeleton;
      return ONB.desktop(
        sk.hubAbove(env) +
          `<div style="margin-block-start:14px">${firstRatingHero(env, 168)}</div>` +
          `<div style="margin-block-start:24px">${sk.hubBelow(env)}</div>`,
        env,
        { tab: "fantasy", title: env.t("app.fantasy.title") },
      );
    },
  });
})();
