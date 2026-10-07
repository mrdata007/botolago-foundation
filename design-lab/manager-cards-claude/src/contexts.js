/* Renders a concept inside the app places a Manager Card identity will live:
   a ranking card, a comment line, a head-to-head strip and a size ladder. */
(function () {
  const MC = window.MC;

  /** The concept's own leaderboard row (its "compact card"), for ALI and the samples. */
  MC.ctxRows = (c, o = {}) =>
    MC.SAMPLES.map((s) => `<div class="ctx-row-slot">${c.row(MC.sample(s), { ...o, rank: s.rank, pts: s.pts, me: !!s.me })}</div>`).join("");

  /** The concept's token inside the standard BotolaGO ranking card (the app keeps its row). */
  MC.ctxRankCard = (c, o = {}) => {
    const S = MC.s(o);
    const h = o.tokenH || 44;
    return (
      `<div class="app-rank-card" style="--token-h:${h}px">` +
      `<div class="app-rank-head"><span>#</span><span>${o.lang === "ar" ? "المدرب" : "Manager"}</span><span>${S.pts}</span></div>` +
      MC.SAMPLES.map((s) => {
        const p = MC.sample(s);
        return (
          `<div class="app-rank-row${s.me ? " is-me" : ""}">` +
          `<span class="app-rank-pos">${s.rank}</span>` +
          `<span class="app-rank-token">${c.token(p, { ...o, size: h })}</span>` +
          `<span class="app-rank-name">${MC.esc(MC.nameOf(p, o))}<small>${MC.esc(S.tiers[p.tier])} · ${MC.ltr(p.ovr + " OVR")}</small></span>` +
          `<span class="app-rank-pts">${s.pts}</span>` +
          `</div>`
        );
      }).join("") +
      `</div>`
    );
  };

  /** A comment line and an H2H strip with the mini identity (24–32px). */
  MC.ctxMini = (c, o = {}) => {
    const h = o.miniH || 28;
    const ali = MC.ALI;
    const opp = MC.sample(MC.SAMPLES[1]);
    const ar = o.lang === "ar";
    const comment = ar
      ? "قرار القائد هذا الأسبوع كان صائبًا. أراكم في الجولة القادمة."
      : "Captain call paid off this week. See you next journée.";
    return (
      `<div class="app-comment" style="--mini-h:${h}px"><span class="mini">${c.token(ali, { ...o, size: h, mini: true })}</span>` +
      `<div><b>${MC.esc(MC.nameOf(ali, o))}</b> <span style="opacity:.7">· ${ar ? "منذ ساعتين" : "2 h"}</span><br>${MC.esc(comment)}</div></div>` +
      `<div class="app-h2h" style="--mini-h:${h}px">` +
      `<div class="side"><span class="mini" style="display:grid;place-items:center;height:${h}px;min-width:${h}px">${c.token(ali, { ...o, size: h, mini: true })}</span><b>${MC.esc(MC.nameOf(ali, o))}</b></div>` +
      `<span class="vs">${ar ? "ضد" : "VS"}</span>` +
      `<div class="side"><span class="mini" style="display:grid;place-items:center;height:${h}px;min-width:${h}px">${c.token(opp, { ...o, size: h, mini: true })}</span><b>${MC.esc(MC.nameOf(opp, o))}</b></div>` +
      `</div>`
    );
  };

  /** The token and the full card as solid silhouettes: is it recognisable before anything is read? */
  MC.ctxSilhouette = (c, o = {}) =>
    `<div class="ctx-sil">` +
    `<figure><div class="ctx-sil-card" style="width:120px">${c.full(MC.ALI, { ...o, thumb: true })}</div><figcaption>card</figcaption></figure>` +
    [56, 44, 28].map((h) => `<figure><div class="ctx-ladder-slot" style="height:${h}px;min-width:${h}px">${c.token(MC.ALI, { ...o, size: h, mini: h <= 32 })}</div><figcaption>${h}px</figcaption></figure>`).join("") +
    `</div>`;

  /** The token at every size from leaderboard to favicon, for the scalability test. */
  MC.TOKEN_SIZES = [80, 64, 56, 44, 32, 24];
  MC.ctxLadder = (c, o = {}) =>
    `<div class="ctx-ladder">` +
    MC.TOKEN_SIZES.map(
      (h) => `<figure><div class="ctx-ladder-slot" style="height:${h}px;min-width:${h}px">${c.token(MC.ALI, { ...o, size: h, mini: h <= 32 })}</div><figcaption>${h}px</figcaption></figure>`,
    ).join("") +
    `</div>`;
})();
