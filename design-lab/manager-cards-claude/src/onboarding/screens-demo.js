/* S00 · DEMO of the kit. Not a design: it proves the pattern the screen files copy.
   A phone screen is `MC.ONB.phone(content, env, opts)`; the content is the app's own blocks
   (MC.ONB.skeleton.*) with the card block set in them. The card always goes through env.card(...),
   which survives a direction that is not ready. Every string comes from env.t(key, vars).
   Variants: forming1 (M3a hub block, a hint alert), rated (M4a hero), detail (M4b sheet). */
(function () {
  const MC = window.MC;
  const ONB = MC.ONB;
  if (!ONB || !ONB.screen) return;
  const K = "card.onboarding.";

  ONB.style(
    "demo",
    `.onb .demo-block { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 120px; padding: 16px; text-align: start; }
     .onb .demo-ovr { display: inline-flex; align-self: flex-start; align-items: baseline; gap: 6px; }
     .onb .demo-col { display: flex; flex-direction: column; gap: 6px; min-width: 0; }`,
  );

  const flag = '<p><span class="onb-demo-flag">DEMO · kit proof, not a design · S00</span></p>';

  /* M3a: the hub block while the number is null. 64px token, the counter as the biggest thing. */
  const formingBlock = (env) => {
    const p = env.p;
    return (
      `<button type="button" class="onb-surface demo-block">` +
      env.card("token", { size: 64 }) +
      `<span class="demo-col onb-grow">` +
      `<span class="onb-t-score">${env.t(K + "m3.counter", { k: p.counted })}</span>` +
      `<span class="onb-t-strong">${env.t(K + "m3.label")}</span>` +
      `<span class="onb-t-meta onb-muted">${env.t(K + "m3.line", { gw: env.ctx.nextGw })}</span>` +
      `</span></button>`
    );
  };

  /* M4a: the hero. Label and close on top, the card at the start, the number, tier and chip at the end. */
  const ratedHero = (env) => {
    const p = env.p;
    const gw = env.ctx.firstRatedGw;
    return ONB.hero(
      `<div class="onb-row" style="--gap:16px;align-items:flex-start">` +
        env.card("full", { width: 132, beat: "first" }) +
        `<div class="demo-col onb-grow">` +
        `<bdi dir="ltr" class="demo-ovr"><span class="onb-t-score-hero">${p.ovr}</span><span class="onb-t-sub">OVR</span></bdi>` +
        `<span class="onb-t-section">${MC.esc(env.tier(p.tier))}</span>` +
        ONB.provisionalChip(env) +
        `</div></div>` +
        `<p class="onb-t-secondary onb-muted" style="margin-block:12px">${env.t(K + "m4.hero.fresh.line")}</p>` +
        ONB.btnRow(
          ONB.button(env.t(K + "m4.hero.detail"), { kind: "primary" }),
          ONB.button(env.t(K + "m4.hero.share"), { kind: "soft" }),
        ),
      env,
      { label: env.t(K + "m4.hero.fresh.label", { gw }) },
    );
  };

  /* M4b: the detail sheet over the hub. Stat tiles show a dash and its reason when a stat is null. */
  const detailSheet = (env) => {
    const p = env.p;
    const tile = (k) => {
      const reason =
        p.statReason && p.statReason[k] ? env.t(K + "state.trf." + p.statReason[k]) : "";
      return ONB.statTile(env.t(K + "m4.sheet.tile." + k.toLowerCase()), p.stats[k], reason);
    };
    return ONB.sheet(
      `<div class="onb-flow" style="--gap:12px;padding-block:4px 16px">` +
        `<div style="display:flex;justify-content:center">${env.card("full", { width: 200 })}</div>` +
        `<p class="onb-t-secondary onb-muted">${env.t(K + "m4.sheet.line")}</p>` +
        `<div class="onb-grid2">${["CAP", "SEL", "TRF", "CON"].map(tile).join("")}</div>` +
        `<p class="onb-t-meta onb-muted">${env.t(K + "m4.sheet.footer")}</p></div>`,
      env,
      {
        title: env.t(K + "m4.sheet.heading"),
        footer: ONB.btnRow(
          ONB.button(env.t(K + "m4.sheet.share"), { kind: "primary" }),
          ONB.button(env.t(K + "m4.sheet.league"), { kind: "soft" }),
        ),
      },
    );
  };

  ONB.screen({
    id: "S00",
    moment: "DEMO",
    title: "Kit demo: the hub with the card block, hero and sheet",
    variants: [
      { key: "forming1", fixture: "forming1", label: "Block while forming, 1 of 3, with a hint" },
      { key: "rated", fixture: "rated", label: "First rating: the hero" },
      { key: "detail", fixture: "rated", label: "First rating: the detail sheet" },
    ],
    render(env) {
      const sk = ONB.skeleton;
      const forming = env.v.key === "forming1";
      const block = forming ? formingBlock(env) : ratedHero(env);
      const hint = forming
        ? ONB.alert(env.t(K + "m3.hint.cap"), env, { tone: "info", dismiss: true })
        : "";
      const content =
        sk.hubAbove(env) +
        `<div class="onb-flow" style="margin-block-start:14px">${flag}${block}${hint}</div>` +
        `<div style="margin-block-start:24px">${sk.hubBelow(env)}</div>`;
      return ONB.phone(content, env, {
        tab: "fantasy",
        title: env.t("app.fantasy.title"),
        scrollTo: ".onb-hub-anchor",
        overlay: env.v.key === "detail" ? detailSheet(env) : "",
      });
    },
  });
})();
