/* CONTRACT EXAMPLE ONLY — a grey wireframe that shows the function signatures,
   sizing technique and RTL handling. It is not a design and is not in the gallery. */
(function () {
  const MC = window.MC;
  const c = {
    id: "c00",
    n: 0,
    slug: "00-contract",
    name: "Contract example",
    category: "safe",
    hidden: true,
    philosophy: "Wireframe used to test the lab plumbing.",

    // Full card: fills the width it is given; everything inside scales with the
    // container (cqi units or an SVG viewBox). o.lang is "lat" or "ar".
    full(p, o = {}) {
      const S = MC.s(o);
      return (
        `<div class="c00" dir="${S.dir}" role="img" aria-label="${MC.esc(MC.label(p, o))}" data-tier="${p.tier}">` +
        `<div class="c00-logo">${MC.logo("wordmark", { variant: "mono", color: "#888", label: false })}</div>` +
        `<div class="c00-ovr">${MC.ltr(p.ovr)}<small>${S.ovr}</small></div>` +
        `<div class="c00-av">${MC.avatar({ torso: "#777", collar: "#666", neck: "#aaa", skin: "#bbb", hair: "#555", seam: "#999" })}</div>` +
        `<div class="c00-name">${MC.esc(MC.nameOf(p, o))}</div>` +
        `<div class="c00-tier">${MC.esc(S.tiers[p.tier])}</div>` +
        `<ul class="c00-stats">${MC.STATS.map((k) => `<li><b>${MC.ltr(p.stats[k])}</b>${MC.esc(S.stats[k])}</li>`).join("")}</ul>` +
        `<div class="c00-meta">${MC.ltr(p.id)} ${MC.ltr(p.season)} ${p.founder ? MC.esc(S.founderLine) : ""}</div>` +
        `</div>`
      );
    },
    // Token: the identity mark alone, sized by o.size (24–80px tall). o.mini is true at <=32px.
    token(p, o = {}) {
      const s = o.size || 44;
      return `<div class="c00-token" style="--s:${s}px"><span>${MC.ltr(p.ovr)}</span></div>`;
    },
    // Row: the concept's own leaderboard row ("compact card"), 358px wide, ~64px tall.
    row(p, o = {}) {
      return `<div class="c00-row${o.me ? " is-me" : ""}" dir="${MC.s(o).dir}"><span>${o.rank}</span>${c.token(p, { ...o, size: 44 })}<b>${MC.esc(MC.nameOf(p, o))}</b><span>${o.pts}</span></div>`;
    },
    // Share: a 360x640 story composition (exported at 1080x1920).
    share(p, o = {}) {
      return `<div class="c00-share"><div style="width:280px">${c.full(p, o)}</div></div>`;
    },
  };
  MC.register(c);
})();
