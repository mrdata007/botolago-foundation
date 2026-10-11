/* S08 · hub hero (M4a, M11), S09 · detail sheet (M4b), S12 · provisional cleared (M7),
   S13 · tier up hero and tier down line (M8), S14 · founder hero (M9).
   The hero is the hub's card block expanded once, an inline section and never a dialog. Under
   motion=1 it has two motions and no more: the app's 8px enter-rise on the hero (transform only,
   so nothing is ever invisible) and the object's own beat over the number that is already there
   ("first" for a rating, "founder" for the grant where the direction has one). The label, the
   number, the tier word, the Provisoire chip, the line and the two buttons are in place from the
   first frame and never move on their own, so nothing below the hero shifts.
   Every string comes from env.t(key); nothing here prints a name in a heading. */
(function () {
  const MC = window.MC;
  const ONB = MC.ONB;
  if (!ONB || !ONB.screen) return;
  const K = "card.onboarding.";
  const esc = MC.esc;

  ONB.style(
    "m4m9",
    `
/* ---------- the hero: card at the start, the reading at the end, then the line and buttons ---------- */
.onb .m49-main { display: flex; align-items: center; gap: 16px; padding-block-start: 2px; }
.onb .m49-main > .onb-card { flex: none; }
.onb .m49-read { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; container-type: inline-size; }
/* "84 OVR" is one unit: the number in Changa 800, OVR inline on its baseline (lab rule 6). */
.onb .m49-ovr { display: inline-flex; align-items: baseline; gap: 6px; direction: ltr; unicode-bidi: isolate; color: var(--ui-on-surface); white-space: nowrap; }
.onb .m49-ovr__n { font: 800 76px/0.92 var(--onb-display); font-variant-numeric: lining-nums; }
.onb .m49-ovr__u { font: 800 20px/1 var(--onb-display); color: var(--ui-ink-fg); }
.onb .m49-ovr--md .m49-ovr__n { font-size: 52px; }
.onb .m49-ovr--md .m49-ovr__u { font-size: 17px; }
.onb .m49-ovr--sm .m49-ovr__n { font-size: 40px; line-height: 1; }
.onb .m49-ovr--sm .m49-ovr__u { font-size: 15px; }
.onb .m49-tier { margin-block-start: 4px; font: 800 26px/1.15 var(--onb-display); color: var(--ui-ink-fg); }
.onb[dir="ltr"] .m49-tier { letter-spacing: 0.02em; }
.onb .m49-tier--sm { margin-block-start: 0; font-size: 17px; }
/* The tier up hero reads the tier first: its word is the display size (fitted to the column). */
.onb .m49-tier--display { margin-block-start: 0; font-size: min(38px, 18.6cqi); line-height: 1.05; }
.onb .m49-read .onb-chip { margin-block-start: 14px; }
.onb .m49-read .m49-ovr + .onb-chip { margin-block-start: 14px; }
.onb .m49-note { margin-block-start: 10px; color: var(--ui-on-surface-muted); font: 600 14px/var(--ui-leading-copy) var(--onb-body); text-wrap: pretty; }
.onb .m49-name { font-family: var(--onb-display); font-weight: 800; color: var(--ui-on-surface); }
.onb .m49-hero .onb-hero__label { text-wrap: pretty; }
.onb .m49-line { margin-block-start: 14px; color: var(--ui-on-surface-muted); font: 600 14px/var(--ui-leading-copy) var(--onb-body); text-wrap: pretty; }
.onb .m49-more .onb-btnrow { margin-block-start: 14px; }

/* The hero's enter-rise (motion=1 only, never under reduced motion): the app's 8px settle, transform
   only, the way .m12-live does it. The object's own beat plays on the card over the same 600ms. */
@media (prefers-reduced-motion: no-preference) {
  .onb .m49-hero--motion { animation: m49-rise 260ms cubic-bezier(0, 0, 0.2, 1) both; }
}
@keyframes m49-rise { from { transform: translateY(8px); } to { transform: none; } }

/* ---------- the hub block after the hero (S12): the M3 block's anatomy, with the number ---------- */
.onb .m49-block { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 120px; padding: 16px; text-align: start; }
.onb .m49-block__col { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
.onb .m49-block__top { display: inline-flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.onb .m49-block__tier { font: 800 17px/1.2 var(--onb-display); color: var(--ui-ink-fg); }

/* ---------- the detail sheet (S09) ---------- */
/* Taller than 85% by a hair (88%) and a little tighter in the head, so the card at 200px, the line,
   the four tiles and the footer fit 844px with no scroll in French and Arabic. */
.onb[data-screen="S09"] .onb-sheet__grab { height: 16px; }
.onb[data-screen="S09"] .onb-sheet__head { min-height: 48px; }
.onb .m49-sheet { padding-block: 0 6px; --gap: 8px; }
.onb .m49-cardrow { position: relative; display: flex; justify-content: center; }
.onb .m49-replay { position: absolute; inset-inline-end: -10px; inset-block-end: -4px; gap: 4px; max-width: 84px; padding-inline: 8px; line-height: 1.25; }
.onb .m49-replay span { text-wrap: balance; }
@media (prefers-reduced-motion: reduce) { .onb .m49-replay { display: none; } }
/* The four tiles: UiStatBlock's anatomy as a 64px row, the long label at the start, the figure at the end. */
.onb .m49-tile { flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; min-height: 64px; padding: 8px 12px; }
.onb .m49-tile__t { display: flex; flex-direction: column; min-width: 0; }
.onb .m49-code { font: 800 13px/1.3 var(--onb-body); color: var(--ui-ink-fg); }
.onb .m49-long { font: 600 12px/1.35 var(--onb-body); color: var(--ui-on-surface-muted); text-wrap: balance; }
.onb .m49-why { font: 600 11px/1.4 var(--onb-body); color: var(--ui-on-surface-muted); text-wrap: balance; }
.onb[dir="rtl"] .m49-code, .onb[dir="rtl"] .m49-long, .onb[dir="rtl"] .m49-why { line-height: 1.6; }
.onb .m49-tile__v { flex: none; line-height: 1.2; }

/* ---------- the card page (S13, tier down) ---------- */
.onb .m49-page { display: flex; flex-direction: column; align-items: center; text-align: center; }
.onb .m49-page .onb-btn { width: 100%; }
.onb .m49-rating { display: flex; align-items: baseline; justify-content: center; gap: 12px; margin-block-start: 6px; }
.onb .m49-state { margin-block-start: 4px; color: var(--ui-on-surface-muted); text-wrap: balance; max-width: 30em; }
.onb .m49-page .onb-grid2 { width: 100%; text-align: start; }
`,
  );

  /* ---------- pieces ---------- */
  const mark = (env, n, size) =>
    `<bdi dir="ltr" class="m49-ovr${size ? " m49-ovr--" + size : ""}"><span class="m49-ovr__n">${esc(n)}</span><span class="m49-ovr__u">${esc(MC.s(env.o).ovr)}</span></bdi>`;
  const tierWord = (env, tier, cls = "") =>
    `<span class="m49-tier${cls ? " " + cls : ""}">${esc(env.tier(tier))}</span>`;

  /** The widest width up to `want` at which the direction's card stays within `maxH` px tall (a
   * tall silhouette such as Semelle's sole is narrowed so the detail sheet still fits 844px). */
  const fitWidth = (env, want, maxH) => {
    try {
      const probe = document.createElement("div");
      probe.className = "onb";
      probe.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
      probe.innerHTML = ONB.card(env, "full", { width: want });
      document.body.appendChild(probe);
      const h = probe.firstElementChild.getBoundingClientRect().height;
      probe.remove();
      return h > maxH ? Math.floor((want * maxH) / h) : want;
    } catch (e) {
      return want;
    }
  };

  /** The hero: label and 44px close on top; card and reading; then the line and two buttons.
   * `still` is the hero seen behind a sheet: the state after a tap, so neither the rise nor the beat. */
  const hero = (env, { label, read, line, primary, secondary, beat, still }) =>
    ONB.hero(
      `<div class="m49-main">${env.card("full", { width: 132, beat: still ? undefined : beat })}<div class="m49-read">${read}</div></div>` +
        `<div class="m49-more">${line ? `<p class="m49-line">${line}</p>` : ""}` +
        ONB.btnRow(
          ONB.button(primary, { kind: "primary" }),
          ONB.button(secondary, { kind: "soft" }),
        ) +
        `</div>`,
      env,
      { label, cls: "m49-hero" + (env.o.motion && !still ? " m49-hero--motion" : "") },
    );

  /** The hub: the app's own blocks, the card block set right under Valeur / Banque / Rang. */
  const hub = (env, block) => {
    const sk = ONB.skeleton;
    return ONB.phone(
      sk.hubAbove(env) +
        `<div style="margin-block-start:14px">${block}</div>` +
        `<div style="margin-block-start:24px">${sk.hubBelow(env)}</div>`,
      env,
      { tab: "fantasy", title: env.t("app.fantasy.title"), scrollTo: ".onb-hub-anchor" },
    );
  };

  /* ---------- S08 · the hub hero: fresh, arrival, coalesced ---------- */
  const heroRated = (env, { still = false } = {}) => {
    const p = env.p;
    const kind = env.v.key;
    const first = env.ctx.firstRating;
    const label =
      kind === "arrival"
        ? env.t(K + "m4.hero.arrival.label")
        : kind === "coalesced" || kind === "coalescedProv"
          ? env.t(K + "m4.hero.coalesced.label", { first: first.ovr, gw: first.gw })
          : env.t(K + "m4.hero.fresh.label", { gw: env.ctx.firstRatedGw });
    const line =
      kind === "arrival"
        ? env.t(K + "m4.hero.arrival.line")
        : p.provisional
          ? env.t(K + "m4.hero.fresh.line")
          : "";
    return hero(env, {
      label,
      read:
        mark(env, p.ovr) + tierWord(env, p.tier) + (p.provisional ? ONB.provisionalChip(env) : ""),
      line,
      primary: env.t(K + "m4.hero.detail"),
      secondary: env.t(K + "m4.hero.share"),
      beat: "first",
      still,
    });
  };

  ONB.screen({
    id: "S08",
    moment: "M4a, M11",
    title: "Hub hero: the first rating",
    variants: [
      {
        key: "fresh",
        fixture: "rated",
        label: "Fresh: the first rating after the third final journée",
      },
      {
        key: "arrival",
        fixture: "launchArrival",
        label: "Launch: an existing manager, already rated",
        ctx: { nextGw: 8 },
      },
      {
        key: "coalesced",
        fixture: "returning",
        label: "Returning: one coalesced hero, first 84 at J3, today 81",
        ctx: { nextGw: 7 },
      },
      {
        key: "coalescedProv",
        fixture: "returning",
        label: "Returning one week after: still provisional (chip and line present)",
        profile: { provisional: true, counted: 4 },
        ctx: { nextGw: 9, latestGw: 4 },
      },
    ],
    render: (env) => hub(env, heroRated(env)),
  });

  /* ---------- S09 · the detail sheet: where the 84 comes from ---------- */
  const replayIcon =
    '<svg class="onb-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';

  /** One stat tile: the long label (and the dash's reason) at the start, the figure at the end. */
  const statRow = (env, k) => {
    const p = env.p;
    const v = p.stats[k];
    const why = p.statReason && p.statReason[k];
    const reason =
      v == null && why ? env.t(K + (k === "TRF" ? "state.trf." : "state.reason.") + why) : "";
    // "CAP · Vos capitaines": the code on its own line, the long label under it (the dot is the
    // string's separator and has no work to do once they are on two lines).
    const [code, ...rest] = env.t(K + "m4.sheet.tile." + k.toLowerCase()).split(" · ");
    return (
      `<div class="onb-stat m49-tile"><span class="m49-tile__t">` +
      (rest.length
        ? `<span class="m49-code">${code}</span><span class="m49-long">${rest.join(" · ")}</span>`
        : `<span class="m49-code">${code}</span>`) +
      (reason ? `<span class="m49-why">${reason}</span>` : "") +
      `</span><span class="onb-t-stat m49-tile__v">${v == null ? ONB.dash : ONB.num(v, env)}</span></div>`
    );
  };

  const detailSheet = (env) => {
    // "Revoir" plays the object's own beat again, number visible throughout. Its card is kept in a
    // template and swapped in on the tap, which restarts the CSS beat. Never automatic.
    const w = fitWidth(env, 200, 376);
    const beatEnv = { ...env, o: { ...env.o, motion: true } };
    const replay = ONB.card(beatEnv, "full", { width: w, beat: "first" });
    return ONB.sheet(
      `<div class="m49-sheet onb-flow" data-m49-scope>` +
        `<div class="m49-cardrow"><div data-m49-card>${env.card("full", { width: w })}</div>` +
        `<button type="button" class="onb-btn onb-btn--text m49-replay" data-m49-replay>${replayIcon}<span>${env.t(K + "m4.sheet.replay")}</span></button>` +
        `<template data-m49-beat>${replay}</template></div>` +
        `<p class="onb-t-secondary onb-muted">${env.t(K + "m4.sheet.line")}</p>` +
        `<div class="onb-grid2">${["CAP", "SEL", "TRF", "CON"].map((k) => statRow(env, k)).join("")}</div>` +
        `<p class="onb-t-meta onb-muted">${env.t(K + "m4.sheet.footer")}</p></div>`,
      env,
      {
        height: 0.88,
        title: env.t(K + "m4.sheet.heading"),
        footer: ONB.btnRow(
          ONB.button(env.t(K + "m4.sheet.share"), { kind: "primary" }),
          ONB.button(env.t(K + "m4.sheet.league"), { kind: "soft" }),
        ),
      },
    );
  };

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("[data-m49-replay]");
    if (!b) return;
    const scope = b.closest("[data-m49-scope]");
    const slot = scope && scope.querySelector("[data-m49-card]");
    const tpl = scope && scope.querySelector("template[data-m49-beat]");
    if (slot && tpl) slot.innerHTML = tpl.innerHTML;
  });

  ONB.screen({
    id: "S09",
    moment: "M4b",
    title: "Detail sheet: where the 84 comes from",
    variants: [
      { key: "rated", fixture: "rated", label: "All four stats", ctx: { nextGw: 8 } },
      {
        key: "ratedTrfNull",
        fixture: "ratedTrfNull",
        label: "TRF empty: a dash and its reason",
        ctx: { nextGw: 8 },
      },
    ],
    render: (env) =>
      ONB.phone(
        ONB.skeleton.hubAbove(env) +
          `<div style="margin-block-start:14px">${heroRated(env, { still: true })}</div>` +
          `<div style="margin-block-start:24px">${ONB.skeleton.hubBelow(env)}</div>`,
        env,
        {
          tab: "fantasy",
          title: env.t("app.fantasy.title"),
          scrollTo: ".onb-hub-anchor",
          overlay: detailSheet(env),
        },
      ),
  });

  /* ---------- S12 · provisional cleared: one quiet line in the hub block ---------- */
  const hubBlock = (env, line) =>
    `<button type="button" class="onb-surface m49-block">${env.card("token", { size: 64 })}` +
    `<span class="m49-block__col onb-grow"><span class="m49-block__top">${mark(env, env.p.ovr, "sm")}` +
    `<span class="m49-block__tier">${esc(env.tier(env.p.tier))}</span></span>` +
    `<span class="onb-t-secondary onb-muted">${line}</span></span></button>`;

  ONB.screen({
    id: "S12",
    moment: "M7",
    title: "Provisional cleared: one line, the chip gone",
    variants: [
      {
        key: "cleared",
        fixture: "cleared",
        label: "The hub block, one line, no hero, no motion",
        ctx: { nextGw: 10 },
      },
    ],
    render: (env) => hub(env, hubBlock(env, env.t(K + "m7.line"))),
  });

  /* ---------- S13 · tier up is shown (hero), tier down is stated (a line on the card page) ---------- */
  const heroTierUp = (env) => {
    const p = env.p;
    return hero(env, {
      label: env.t(K + "m8.up.heading"),
      read: tierWord(env, p.tier, "m49-tier--display") + mark(env, p.ovr, "md"),
      line: env.t(K + "m8.up.line", { gw: env.ctx.latestGw }),
      primary: env.t(K + "m8.view"),
      secondary: env.t(K + "m4.hero.share"),
      beat: "first",
    });
  };

  /** The card page, only as far as M8b needs it: the card, its rating, the stated tier, the stats. */
  const cardPage = (env) => {
    const p = env.p;
    return ONB.phone(
      `<div class="m49-page onb-flow" style="--gap:12px">` +
        `<div>${env.card("full", { width: fitWidth(env, 208, 352) })}</div>` +
        `<div><div class="m49-rating">${mark(env, p.ovr, "sm")}<span class="m49-block__tier">${esc(env.tier(p.tier))}</span></div>` +
        `<p class="onb-t-secondary m49-state">${env.t(K + "m8.down.line", { best: env.tier(env.ctx.previousTier) })}</p></div>` +
        `<div class="onb-grid2">${["CAP", "SEL", "TRF", "CON"].map((k) => statRow(env, k)).join("")}</div>` +
        ONB.button(env.t(K + "m4.hero.share"), { kind: "soft", full: true }) +
        `</div>`,
      env,
      { tab: "fantasy", back: true, title: env.t(K + "m2.heading") },
    );
  };

  ONB.screen({
    id: "S13",
    moment: "M8",
    title: "Tier up hero, tier down line",
    variants: [
      {
        key: "tierUp",
        fixture: "tierUp",
        label: "Up, first time at CHAMPION: the hub hero",
        ctx: { nextGw: 13 },
      },
      {
        key: "tierDown",
        fixture: "tierDown",
        label: "Down: one line on the card page, no hero, no motion",
      },
    ],
    render: (env) => (env.v.key === "tierDown" ? cardPage(env) : hub(env, heroTierUp(env))),
  });

  /* ---------- S14 · the founder hero ---------- */
  const heroFounder = (env) => {
    const p = env.p;
    const name = ONB.raw(
      `<span class="m49-name">${esc(MC.nameOf(p, env.o))}</span>`,
      MC.nameOf(p, env.o),
    );
    return hero(env, {
      label: env.t(K + "m9.heading"),
      read:
        mark(env, p.ovr, "sm") +
        tierWord(env, p.tier, "m49-tier--sm") +
        `<p class="m49-note">${env.t(K + "m9.line", { name })}</p>`,
      line: "",
      primary: env.t(K + "m8.view"),
      secondary: env.t(K + "m4.hero.share"),
      // The grant is the founder part's moment: a direction that has its own beat for it plays that
      // (Écharpe knits the cream cast-on, 2026 with it); one that does not keeps the "first" beat.
      beat:
        env.c && Array.isArray(env.c.beats) && env.c.beats.includes("founder")
          ? "founder"
          : "first",
    });
  };

  ONB.screen({
    id: "S14",
    moment: "M9",
    title: "Founder hero",
    variants: [
      {
        key: "founder",
        fixture: "founder",
        label: "Founder granted: ·26 after the name, here only",
        ctx: { nextGw: 11 },
      },
    ],
    render: (env) => hub(env, heroFounder(env)),
  });
})();
