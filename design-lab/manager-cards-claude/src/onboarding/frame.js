/* Onboarding screens: the registry, the card helper and the mocked BotolaGO app chrome.
   Screen agents read this comment and screens-demo.js; nothing else is needed to build a screen.

   CONVENTIONS
   - Text parameters are HTML. Pass env.t(key, vars) (escaped, digits isolated in Arabic) or
     MC.esc(text). Attribute labels (closeLabel, aria) are escaped plain text: env.text(key, vars).
   - Every function returns an HTML string. All styles are scoped under .onb (onboarding.css).
   - Every control is a <button> of at least 44 x 44. Logical CSS only; Arabic mirrors itself.
   - Type classes for your own markup: onb-t-title (34), onb-t-section (22), onb-t-header (19),
     onb-t-sub (17), onb-t-strong (15/800), onb-t-body (15), onb-t-secondary (14), onb-t-meta (13),
     onb-t-label (12/800), onb-t-micro (11), onb-t-stat (22, tabular), onb-t-score (40, Changa);
     colour: onb-muted, onb-faint, onb-ink. Layout: onb-gutter, onb-flow (children spaced by --gap,
     default 12px), onb-row (flex row, --gap), onb-grow, onb-grid2, onb-btnrow, onb-surface (a card).
   - Tokens (inline styles): var(--ui-surface), --ui-surface-sunken, --ui-page, --ui-on-surface,
     --ui-on-surface-muted, --ui-rule, --ui-ink-fg, --ui-ink-deep, --ui-grad-action, --ui-card-shadow.

   REGISTRY
   MC.ONB.screen({ id: "S05", moment: "M2", title: "...", desktop?: true,
     variants: [{ key: "new", fixture: "born0", label: "...", profile?: {...}, ctx?: {...} }, ...],
     render(env) { return HTML } })
     id: "S01".."S18" or "D1". variants[].fixture is a key of MC.ONB.FIX (states.js). profile and
     ctx merge over the fixture's profile and ctx for this variant only (never edit states.js).
     desktop: true renders at 1440 wide with no phone frame (D1). The grid lists screens by id.
   MC.ONB.SCREENS (array), MC.ONB.get(id).

   env (passed to render)
     env.c        the direction module (may be undefined or throw: always go through MC.ONB.card)
     env.f / env.p / env.ctx   fixture, f.profile (what the card draws), f.ctx (what the screen knows)
     env.v        the variant ({ key, fixture, label })
     env.lang     "fr" | "ar";  env.ar  boolean;  env.scheme  "light" | "dark"
     env.o        { lang: "lat" | "ar", motion }  the card options (the kit says "lat" for French)
     env.t(key, vars)     HTML string from strings.js, merged over env.vars (below)
     env.text(key, vars)  the same text with no markup (attribute-safe)
     env.vars     defaults for placeholders, from the fixture: n (min rounds rated, 3), nf (final, 5),
                  k (counted), serial (BOT #n, only when set), ovr (only when set), tier, season,
                  deadline, gws ("J5, J6, J7" / "الجولات 5 و6 و7"), name (body lines only, never a
                  heading). {gw} is never defaulted: pass it. A missing var is left as {name} and warned.
     env.num(n)  env.gw(n)  env.rounds(n)   HTML with digits isolated (see MC.ONB.num, gw, rounds)
     env.gwText(n)  env.gwListText([5,6,7])  env.roundsText(n)  plain text for env.t vars
     env.tier(tier)  tier word ("PRO" | "محترف");  env.stat(k)  { code, long }  kit labels
     env.pick({lat, ar})  the value for the language;  env.label  MC.label(p, o), the card's aria name
     env.card(kind, opts)  = MC.ONB.card(env, kind, opts)

   CARD  MC.ONB.card(env, "full" | "token" | "row" | "share", opts) -> HTML
     Wraps the direction's output in a container-type: inline-size slot, passes {...env.o, ...opts}
     and catches exceptions (a dashed « direction not ready: <error> » box and a console.warn).
     opts: width (px or css; full default 200, row 358, share 360), size (token height, default 44;
     mini is set for size <= 32), beat ("make" | "first" | "tick" | "founder": passed only when the
     page has motion=1, and the only motion the card plays: o.motion is always false here),
     rank, pts, me (rows), p (another profile), cls. The full card fills its width.
     MC.ONB.dash = "—"  (a missing number is always this, never 0).

   APP CHROME
   phone(content, env, { tab, title, back, scroll, scrollTop, scrollTo, overlay, nav, topbar,
     gutter, signedIn }) -> the 390 x 844 screen root (status bar, top bar, content, bottom tabs).
     tab: "home" | "news" | "fantasy" | "matches" | "pepites" (the active tab; none if omitted).
     title: the hub title band under the top bar ("Fantasy", Changa 34); with back:true (or an HTML
     label) it is the inner-screen header instead (back pill, centred title, as UiHeader).
     scroll: false clips the content (default: scrolls). scrollTop: px, or scrollTo: a css selector
     inside the content, to show a lower part of a long screen (applied after render).
     overlay: HTML placed over the whole screen (use sheet()). nav: false hides the tabs; topbar:
     false hides the top bar; gutter: false makes the content full-bleed (default: 16px sides);
     signedIn: false hides the bell; trailing: HTML for the header's end slot (back mode only). The
     content
     area under a hub title is 614px tall in French and 585px in Arabic (taller leading).
   desktop(content, env, { tab, title, width: "column" | "wide" }) -> the 1440 root (wide top bar,
     then the 672px Fantasy column with its rounded corners, or a 1320px canvas; use onb-dcols for
     three columns).
   sheet(content, env, { height: 0.85, title, closeLabel, footer }) -> OVERLAY html for phone({overlay}):
     dimmed screen, drag handle, title and a 44px close at the top, sticky footer for buttons.
   hero(content, env, { label, closeLabel }) / panel(content, env, { heading, closeLabel }) -> an
     inline expanded block (never a dialog): the label as an h3, a 44px labelled close, the content.
   alert(text, env, { tone: "info" | "positive" | "caution" | "negative", dismiss, title }) -> UiAlert.
   button(label, { kind: "primary" | "soft" | "text" | "ink", full, icon, cls, attrs }) -> 48px
     (text buttons 44px). btnRow(a, b) puts two buttons side by side.
   chip(label) -> a text pill. provisionalChip(env) -> « Provisoire » / «مبدئي».
   iconButton(icon, ariaLabel, { variant: "soft" | "ghost" | "ink", cls }), closeButton(env, label).
   statTile(label, value, reason) -> a 64px tile; a null value shows "—" and the reason.
   section(title, content, { action }) -> a Changa 22 heading and its content.
   row({ lead, title, sub, trail, chevron, tag, cls, attrs }), list([rows]) -> a card of rows.
   style(id, css) -> appends a <style> once; use it for classes your screen needs (scope them under
     .onb, e.g. ".onb .m3-block { ... }"). Do not edit onboarding.css.
   icon(name, { size, cls }) -> inline lucide-style svg (home, newspaper, trophy, calendar, gem,
     search, bell, user, back, chevron, x, info, alert, star, plus, timer, shirt, swap, users,
     sliders, trending, check).
   skeleton: bar(w, h), block(h), deadlineCard(env, { gw, deadline }), teamCard(env),
     summaryTiles(env) (Valeur, Banque, Rang), transfersRow(env), nextAction(env),
     hubAbove(env) (deadline, team card, "Composer l'équipe", transfers, then the Valeur / Banque /
     Rang tiles wrapped in .onb-hub-anchor: use phone(..., { scrollTo: ".onb-hub-anchor" }) so the
     block you add right after it is on screen), shortcuts(env), leagues(env), hubBelow(env)
     (shortcuts and "Mes ligues": add it so the content always scrolls far enough), pitch(env, { h }).
   Neutral bars stand in for numbers; labels are the app's real ones.

   DIGITS  MC.ONB.iso(text, env) -> escaped text with each run of digits isolated in Arabic;
     MC.ONB.num(n, env) -> <bdi dir="ltr">n</bdi> ("—" when null); MC.ONB.gw(n, env) -> J5 /
     الجولة 5; MC.ONB.rounds(n, env) -> "3 journées" / "3 جولات" (Arabic plural: 1 جولة واحدة, 2
     جولتان, 3-10 جولات, 11+ جولة); gwList(arr, env); the *Text twins take (value, lang) and return plain text. */
(function () {
  const MC = (window.MC = window.MC || {});
  const ONB = (MC.ONB = MC.ONB || {});
  const esc = MC.esc;
  const DASH = "—";
  ONB.dash = DASH;

  /* ---------- digits, gameweeks, rounds ---------- */
  const nfs = {};
  const fmtNum = (n, lang) => {
    const loc = lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR";
    return (nfs[loc] = nfs[loc] || new Intl.NumberFormat(loc)).format(n);
  };
  ONB.fmtNum = fmtNum;
  const langOf = (env) => (env && env.ar ? "ar" : "fr");
  /** A number with its digits isolated; "—" for null (never 0). */
  ONB.num = (n, env) => (n == null ? DASH : `<bdi dir="ltr">${esc(fmtNum(n, langOf(env)))}</bdi>`);
  ONB.gwText = (n, lang) => (lang === "ar" ? `الجولة ${n}` : `J${n}`);
  ONB.gw = (n, env) => (env && env.ar ? `الجولة ${ONB.num(n, env)}` : `J${esc(n)}`);
  ONB.gwListText = (arr, lang) => {
    if (lang !== "ar") return arr.map((n) => `J${n}`).join(", ");
    if (arr.length === 1) return `الجولة ${arr[0]}`;
    return `${arr.length === 2 ? "الجولتين" : "الجولات"} ${arr.join(" و")}`;
  };
  ONB.gwList = (arr, env) => esc(ONB.gwListText(arr, langOf(env)));
  /** Escaped text; in Arabic every run of Western digits (12, 09:10, 2026) is isolated left to right. */
  ONB.iso = (text, env) =>
    env && env.ar ? esc(text).replace(/\d+(?:[:/.,]\d+)*/g, '<bdi dir="ltr">$&</bdi>') : esc(text);
  ONB.roundsText = (n, lang) =>
    lang === "ar"
      ? MC.arPlural(n, {
          one: "جولة واحدة",
          two: "جولتان",
          few: `${n} جولات`,
          many: `${n} جولة`,
          other: `${n} جولة`,
        })
      : `${n} journée${n > 1 ? "s" : ""}`;
  ONB.rounds = (n, env) => {
    const t = ONB.roundsText(n, langOf(env));
    return env && env.ar ? esc(t).replace(/\d+/, (d) => `<bdi dir="ltr">${d}</bdi>`) : esc(t);
  };

  /** Adds a <style> element once (screen files have no stylesheet of their own). Scope under .onb. */
  ONB.style = (id, css) => {
    if (document.getElementById("onb-style-" + id)) return;
    const el = document.createElement("style");
    el.id = "onb-style-" + id;
    el.textContent = css;
    document.head.appendChild(el);
  };

  /* ---------- registry ---------- */
  const SCREENS = (ONB.SCREENS = ONB.SCREENS || []);
  const orderKey = (id) => {
    const m = /^([SD])(\d+)/i.exec(id);
    return m ? [m[1].toUpperCase() === "S" ? 0 : 1, Number(m[2])] : [2, 0];
  };
  ONB.screen = (def) => {
    const d = { variants: [{ key: "default", fixture: "rated", label: "" }], ...def };
    const i = SCREENS.findIndex((s) => s.id === d.id);
    if (i >= 0) SCREENS.splice(i, 1);
    SCREENS.push(d);
    SCREENS.sort((a, b) => {
      const x = orderKey(a.id);
      const y = orderKey(b.id);
      return x[0] - y[0] || x[1] - y[1] || a.id.localeCompare(b.id);
    });
    return d;
  };
  ONB.get = (id) => SCREENS.find((s) => s.id.toLowerCase() === String(id).toLowerCase());

  /* ---------- the environment a screen renders with ---------- */
  ONB.makeEnv = (def, variant, { c, lang = "fr", scheme = "light", motion = false } = {}) => {
    const base = ONB.FIX && ONB.FIX[variant.fixture];
    if (!base) throw new Error(`unknown fixture "${variant.fixture}"`);
    const profile = Object.freeze({ ...base.profile, ...(variant.profile || {}) });
    const ctx = Object.freeze({ ...base.ctx, ...(variant.ctx || {}) });
    const f = Object.freeze({ ...base, profile, ctx });
    const l = lang === "ar" ? "ar" : "fr";
    const ar = l === "ar";
    const o = { lang: ar ? "ar" : "lat", motion: !!motion };
    const S = MC.s(o);
    const pick = (v) => (v == null ? v : v[ar ? "ar" : "lat"]);
    const vars = {};
    if (profile.minRated != null) vars.n = profile.minRated;
    if (profile.minFinal != null) vars.nf = profile.minFinal;
    if (profile.counted != null) vars.k = profile.counted;
    if (profile.id) vars.serial = profile.id;
    if (profile.ovr != null) vars.ovr = profile.ovr;
    if (profile.tier) vars.tier = S.tiers[profile.tier];
    if (profile.season) vars.season = profile.season;
    if (ctx.deadline) vars.deadline = pick(ctx.deadline);
    if (ctx.ratingGws) vars.gws = ONB.gwListText(ctx.ratingGws, l);
    if (profile.name) vars.name = MC.nameOf(profile, o);
    const env = {
      c,
      f,
      p: profile,
      ctx,
      v: variant,
      screen: def,
      lang: l,
      ar,
      o,
      scheme: scheme === "dark" ? "dark" : "light",
      vars,
      pick,
      label: MC.label(profile, o),
      tier: (t) => (t ? S.tiers[t] : ""),
      stat: (k) => ({ code: S.stats[k], long: S.statsLong[k] }),
    };
    env.t = (key, v) => ONB.fmt(l, key, { ...vars, ...v }, true);
    env.text = (key, v) => ONB.fmt(l, key, { ...vars, ...v }, false);
    env.num = (n) => ONB.num(n, env);
    env.gw = (n) => ONB.gw(n, env);
    env.rounds = (n) => ONB.rounds(n, env);
    env.gwText = (n) => ONB.gwText(n, l);
    env.gwListText = (arr) => ONB.gwListText(arr, l);
    env.roundsText = (n) => ONB.roundsText(n, l);
    env.card = (kind, opts) => ONB.card(env, kind, opts);
    return env;
  };

  /* ---------- icons (lucide paths, 24 grid, 2px stroke) ---------- */
  const ICONS = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    newspaper:
      '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
    trophy:
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    calendar:
      '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    timer:
      '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    shirt:
      '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
    swap: '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/>',
    users:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    sliders:
      '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    trending:
      '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
  };
  const MIRRORED = new Set(["back", "chevron"]);
  ONB.icon = (name, { size = 20, cls = "" } = {}) =>
    `<svg class="onb-ico${MIRRORED.has(name) ? " onb-ico--dir" : ""}${cls ? " " + cls : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;

  /* ---------- the card helper ---------- */
  const warnedCards = new Set();
  const px = (v) => (typeof v === "number" ? v + "px" : v);
  const missing = (msg, style, cls = "") =>
    `<div class="onb-missing ${cls}" role="note" title="${esc(msg)}" style="${style}">direction not ready: ${esc(msg)}</div>`;
  /**
   * MC.ONB.card(env, kind, opts): the direction's card in a container-type: inline-size slot.
   * A direction that throws (or is not loaded) shows a dashed placeholder and a console.warn.
   */
  ONB.card = (env, kind, opts = {}) => {
    const { width, cls = "", p: pOver, ...rest } = opts;
    const p = pOver || env.p;
    const o = { ...env.o, ...rest };
    if (!env.o.motion) delete o.beat;
    // The page's motion switch only lets a beat play. The direction's own gallery motion (the
    // fringe swing, the founder cast-on, a ceremony) never runs here: on a card the beat is the
    // one motion, and a card with no beat stands still.
    o.motion = false;
    const c = env.c;
    const extra = cls ? " " + cls : "";
    const W = width == null ? (kind === "row" ? 358 : kind === "share" ? 360 : 200) : width;
    const size = rest.size || 44;
    try {
      if (!c || typeof c[kind] !== "function")
        throw new Error(c ? `${kind}() missing` : "no direction loaded");
      if (kind === "token") {
        o.size = size;
        o.mini = rest.mini != null ? rest.mini : size <= 32;
        return `<span class="onb-card onb-card--token${extra}" data-onb-card="token" style="height:${size}px;min-width:${size}px">${c.token(p, o)}</span>`;
      }
      if (kind === "full") {
        return `<div class="onb-card onb-card--full${extra}" data-onb-card="full" style="width:${px(W)}">${c.full(p, o)}</div>`;
      }
      if (kind === "row") {
        return `<div class="onb-card onb-card--row${extra}" data-onb-card="row" style="width:min(100%,${px(W)})">${c.row(p, o)}</div>`;
      }
      if (kind === "share") {
        const w = typeof W === "number" ? W : 360;
        const s = w / 360;
        return `<div class="onb-card onb-card--share${extra}" data-onb-card="share" style="width:${w}px;height:${Math.round(640 * s)}px"><div class="onb-card__scaled" style="transform:scale(${s})"${env.ar ? ' dir="rtl"' : ""}>${c.share(p, o)}</div></div>`;
      }
      throw new Error(`unknown card kind "${kind}"`);
    } catch (e) {
      const key = `${c && c.id}:${kind}:${e.message}`;
      if (!warnedCards.has(key)) {
        warnedCards.add(key);
        console.warn(`[onboarding] direction ${(c && c.id) || "?"} ${kind}(): ${e.message}`);
      }
      const h =
        kind === "token"
          ? `${size}px`
          : kind === "row"
            ? "64px"
            : kind === "share"
              ? `${Math.round((typeof W === "number" ? W : 360) * 1.78)}px`
              : `${Math.round((typeof W === "number" ? W : 200) * 1.42)}px`;
      const w = kind === "token" ? `${Math.max(size, 44)}px` : px(W);
      return missing(
        e.message,
        `width:${kind === "row" ? "min(100%," + w + ")" : w};height:${h};${kind === "token" ? "font-size:8px;padding:2px;display:inline-grid" : ""}`,
        `onb-card--${kind}${extra}`,
      );
    }
  };

  /* ---------- small controls ---------- */
  ONB.iconButton = (icon, label, { variant = "soft", cls = "", size = 20 } = {}) =>
    `<button type="button" class="onb-iconbtn${variant === "ghost" ? " onb-iconbtn--ghost" : variant === "ink" ? " onb-iconbtn--ink" : ""}${cls ? " " + cls : ""}" aria-label="${label}">${ONB.icon(icon, { size })}</button>`;
  ONB.closeButton = (env, label, cls = "") =>
    ONB.iconButton("x", label || env.text("card.onboarding.common.close"), { cls });
  ONB.button = (
    label,
    { kind = "primary", full = false, icon = null, cls = "", attrs = "" } = {},
  ) =>
    `<button type="button" class="onb-btn onb-btn--${kind}${full ? " onb-btn--full" : ""}${cls ? " " + cls : ""}"${attrs ? " " + attrs : ""}>${icon ? ONB.icon(icon, { size: 18 }) : ""}<span>${label}</span></button>`;
  ONB.btnRow = (a, b) => `<div class="onb-btnrow">${a}${b}</div>`;
  ONB.chip = (label, cls = "") => `<span class="onb-chip${cls ? " " + cls : ""}">${label}</span>`;
  ONB.provisionalChip = (env) => ONB.chip(env.t("card.onboarding.common.provisional"));
  ONB.alert = (text, env, { tone = "info", dismiss = false, title = null, closeLabel } = {}) =>
    `<div class="onb-alert${tone === "info" ? "" : " onb-alert--" + tone}" role="${tone === "negative" ? "alert" : "status"}">` +
    `<span class="onb-alert__icon">${ONB.icon(tone === "caution" || tone === "negative" ? "alert" : "info")}</span>` +
    `<div class="onb-alert__text">${title ? `<p class="onb-alert__title">${title}</p>` : ""}${text}</div>` +
    (dismiss
      ? ONB.iconButton("x", closeLabel || env.text("card.onboarding.common.close"), {
          variant: "ghost",
          cls: "onb-alert__dismiss",
        })
      : "") +
    `</div>`;
  ONB.statTile = (label, value, reason) => {
    const none = value == null;
    return (
      `<div class="onb-stat"><span class="onb-t-label onb-muted">${label}</span>` +
      `<span class="onb-t-stat onb-stat__value">${none ? DASH : typeof value === "number" ? `<bdi dir="ltr">${value}</bdi>` : value}</span>` +
      (none && reason ? `<span class="onb-t-micro onb-stat__reason">${reason}</span>` : "") +
      `</div>`
    );
  };
  ONB.section = (title, content, { action = "", as = "h2" } = {}) =>
    `<section class="onb-section"><header><${as} class="onb-t-section">${title}</${as}>${action}</header>${content}</section>`;
  ONB.row = ({
    lead = "",
    title = "",
    sub = "",
    trail = "",
    chevron = false,
    tag = "div",
    cls = "",
    attrs = "",
  } = {}) =>
    `<${tag}${tag === "button" ? ' type="button"' : ""} class="onb-listrow${cls ? " " + cls : ""}"${attrs ? " " + attrs : ""}>${lead}` +
    `<span class="onb-grow"><span class="onb-t-strong" style="display:block">${title}</span>${sub ? `<span class="onb-t-meta onb-muted" style="display:block">${sub}</span>` : ""}</span>` +
    `${trail}${chevron ? `<span class="onb-muted">${ONB.icon("chevron")}</span>` : ""}</${tag}>`;
  ONB.list = (rows) => `<div class="onb-list">${rows.join("")}</div>`;

  /* ---------- hero, panel, sheet ---------- */
  const inlineBlock = (kind, content, env, { label = "", closeLabel, close = true, cls = "" }) => {
    const id = MC.uid("onb-h");
    return (
      `<section class="onb-${kind}${kind === "panel" ? " onb-hero" : ""}${cls ? " " + cls : ""}" aria-labelledby="${id}">` +
      `<div class="onb-hero__top"><h3 id="${id}" class="onb-t-sub onb-hero__label">${label}</h3>${close ? ONB.closeButton(env, closeLabel) : ""}</div>` +
      content +
      `</section>`
    );
  };
  /** An expanded inline block (never a dialog): label, a 44px close, the content. */
  ONB.hero = (content, env, opts = {}) => inlineBlock("hero", content, env, opts);
  /** The M2 panel: the same block with a heading. */
  ONB.panel = (content, env, { heading = "", ...opts } = {}) =>
    inlineBlock("panel", content, env, { label: heading, ...opts });
  /** A bottom sheet over a dimmed screen. Returns overlay HTML: phone(content, env, { overlay }). */
  ONB.sheet = (content, env, { height = 0.85, title = "", closeLabel, footer = "" } = {}) => {
    const id = MC.uid("onb-s");
    return (
      `<div class="onb-overlay"><section class="onb-sheet" role="dialog" aria-modal="true" aria-labelledby="${id}" style="height:${Math.round(height * 100)}%">` +
      `<div class="onb-sheet__grab" aria-hidden="true"><span></span></div>` +
      `<div class="onb-sheet__head"><h2 id="${id}" class="onb-t-sub">${title}</h2>${ONB.closeButton(env, closeLabel)}</div>` +
      `<div class="onb-sheet__body">${content}</div>` +
      (footer ? `<div class="onb-sheet__foot">${footer}</div>` : "") +
      `</section></div>`
    );
  };

  /* ---------- phone and desktop shells ---------- */
  const NAV = [
    ["home", "home", "app.nav.home"],
    ["news", "newspaper", "app.nav.news"],
    ["fantasy", "trophy", "app.nav.fantasy"],
    ["matches", "calendar", "app.nav.matches"],
    ["pepites", "gem", "app.nav.pepites"],
  ];
  const wordmark = (env, h = 20) =>
    `<span class="onb-logo">${MC.logo("wordmark", {
      h,
      w: Math.round(h * MC.LOGO_RATIO.wordmark),
      variant: env.scheme === "dark" ? "mono" : "color",
      color: "currentColor",
    })}</span>`;
  const tools = (env, { signedIn = true, tab } = {}) =>
    `<div class="onb-topbar__tools">` +
    ONB.iconButton("search", env.text("app.search")) +
    (signedIn ? ONB.iconButton("bell", env.text("app.notifications")) : "") +
    `<button type="button" class="onb-iconbtn onb-iconbtn--lang" aria-label="${env.text("app.language")}">${env.ar ? "ع" : "FR"}</button>` +
    ONB.iconButton("user", env.text("app.nav.profile"), {
      variant: tab === "profile" ? "ink" : "soft",
    }) +
    `</div>`;
  const statusBar = () =>
    `<div class="onb-status" aria-hidden="true"><span>9:41</span><span class="onb-status__icons">` +
    `<svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect y="7" width="3" height="4" rx=".7"/><rect x="4.7" y="5" width="3" height="6" rx=".7"/><rect x="9.4" y="2.5" width="3" height="8.5" rx=".7"/><rect x="14" width="3" height="11" rx=".7"/></svg>` +
    `<svg width="25" height="12" viewBox="0 0 25 12"><rect x=".5" y=".5" width="21" height="11" rx="3.2" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor"/><path d="M23 4v4c.8-.3 1.5-1.1 1.5-2S23.8 4.3 23 4z" fill="currentColor" opacity=".5"/></svg>` +
    `</span></div>`;
  const rootAttrs = (env, extra = "") =>
    ` dir="${env.ar ? "rtl" : "ltr"}" lang="${env.ar ? "ar" : "fr"}" data-screen="${esc(env.screen.id)}" data-variant="${esc(env.v.key)}"${extra}`;

  /** The 390 x 844 phone screen: status bar, the app's top bar (or inner header), content, tabs. */
  ONB.phone = (content, env, opts = {}) => {
    const o = { nav: true, topbar: true, scroll: true, gutter: true, signedIn: true, ...opts };
    let head = "";
    if (o.topbar && o.back) {
      const backLabel = typeof o.back === "string" ? o.back : env.t("app.back");
      head =
        `<header class="onb-header"><div class="onb-header__row">` +
        `<div><button type="button" class="onb-backpill">${ONB.icon("back")}<span>${backLabel}</span></button></div>` +
        `<h1 class="onb-header__title onb-t-header">${o.title || ""}</h1>` +
        `<div class="onb-header__end">${o.trailing || ""}</div></div></header>`;
    } else if (o.topbar) {
      head =
        `<header class="onb-topbar"><div class="onb-topbar__row">${wordmark(env)}${tools(env, o)}</div></header>` +
        (o.title ? `<div class="onb-titleband"><h1 class="onb-t-title">${o.title}</h1></div>` : "");
    }
    const scrollAttrs =
      (o.scrollTop != null ? ` data-scroll-top="${Number(o.scrollTop)}"` : "") +
      (o.scrollTo ? ` data-scroll-to="${esc(o.scrollTo)}"` : "");
    const tabs = o.nav
      ? `<nav class="onb-tabs" aria-label="${env.text("app.nav.primary")}">` +
        NAV.map(
          ([id, icon, key]) =>
            `<button type="button" class="onb-tab"${o.tab === id ? ' aria-current="page"' : ""}><span class="onb-tab__pill">${ONB.icon(icon)}</span><span class="onb-tab__label">${env.t(key)}</span></button>`,
        ).join("") +
        `</nav>`
      : "";
    return (
      `<div class="onb onb-phone app-${env.scheme}"${rootAttrs(env)}>` +
      statusBar() +
      head +
      `<main class="onb-scroll${o.scroll ? "" : " onb-scroll--clip"}"${scrollAttrs}><div class="onb-body${o.gutter ? "" : " onb-body--bleed"}">${content}</div></main>` +
      tabs +
      (o.overlay || "") +
      `</div>`
    );
  };

  /** The 1440 screen: the app's wide top bar, then the 672px Fantasy column or a 1320px canvas. */
  ONB.desktop = (content, env, opts = {}) => {
    const o = { tab: "fantasy", width: "column", ...opts };
    const nav = NAV.map(
      ([id, , key]) =>
        `<button type="button" class="onb-pill"${o.tab === id ? ' aria-current="page"' : ""}>${env.t(key)}</button>`,
    ).join("");
    const top =
      `<header class="onb-dtop"><div class="onb-dtop__row">${wordmark(env)}<nav class="onb-dnav" aria-label="${env.text("app.nav.primary")}">${nav}</nav>` +
      `<div class="onb-search">${ONB.icon("search", { size: 18 })}<span>${env.t("app.search")}</span></div>` +
      `<div class="onb-topbar__tools" style="margin-inline-start:0">${ONB.iconButton("bell", env.text("app.notifications"))}<button type="button" class="onb-iconbtn onb-iconbtn--lang" aria-label="${env.text("app.language")}">${env.ar ? "ع" : "FR"}</button>${ONB.iconButton("user", env.text("app.nav.profile"))}</div></div></header>`;
    const title = o.title
      ? `<div class="onb-titleband" style="border-radius:0"><h1 class="onb-t-title">${o.title}</h1></div>`
      : "";
    const main =
      o.width === "wide"
        ? `<main class="onb-dwide">${title}${content}</main>`
        : `<main class="onb-dcol">${title}<div class="onb-body">${content}</div></main>`;
    return `<div class="onb onb-desktop app-${env.scheme}"${rootAttrs(env)}>${top}${main}</div>`;
  };

  /* ---------- skeletons: the app around the card ---------- */
  const bar = (w, h = 12, cls = "") =>
    `<span class="onb-sk${cls ? " " + cls : ""}" style="width:${px(w)};height:${h}px"></span>`;
  const block = (h, cls = "") =>
    `<div class="onb-sk onb-sk--card ${cls}" style="height:${h}px"></div>`;
  const SK = (ONB.skeleton = { bar, block });

  /** DeadlineCard: the gameweek, its deadline, a countdown of three tiles (bars for the figures). */
  SK.deadlineCard = (env, { gw, deadline } = {}) => {
    const g = gw != null ? gw : (env.ctx.nextGw ?? env.ctx.firstGw ?? 5);
    const d = deadline != null ? deadline : env.pick(env.ctx.deadline) || "";
    const tile = (key) =>
      `<div class="onb-timetile">${bar(30, 22)}<span class="onb-t-micro onb-muted">${env.t(key)}</span></div>`;
    return (
      `<section class="onb-feature" aria-label="${env.text("app.gameweek")} ${esc(g)}">` +
      `<p style="display:flex;flex-wrap:wrap;align-items:baseline;gap:0 8px"><span class="onb-t-title" style="text-transform:uppercase">${env.t("app.gameweek")} ${ONB.num(g, env)}</span><span class="onb-t-label" style="opacity:.8">· ${env.t("app.deadline")}</span></p>` +
      `<p class="onb-t-secondary" style="font-weight:800;margin-block-start:2px"><bdi>${ONB.iso(d, env)}</bdi></p>` +
      `<div class="onb-grid2" style="grid-template-columns:repeat(3,1fr);margin-block-start:12px">${tile("app.hours")}${tile("app.minutes")}${tile("app.seconds")}</div>` +
      `</section>`
    );
  };
  /** The manager's gradient team card: names and points as bars, the real strip labels. */
  SK.teamCard = (env) => {
    const cell = (key) =>
      `<div>${`<span class="onb-t-label">${env.t(key)}</span>`}${bar(28, 16)}</div>`;
    return (
      `<section class="onb-feature">` +
      `<div class="onb-row" style="--gap:12px;align-items:flex-start;justify-content:space-between">` +
      `<div style="display:flex;flex-direction:column;gap:8px">${bar(150, 22)}${bar(90, 12)}<span class="onb-t-meta" style="font-weight:700;margin-block-start:6px">${env.t("app.rank")} ${bar(34, 12)}</span></div>` +
      `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${bar(70, 44)}<span class="onb-t-label" style="max-width:9.5rem;text-align:end">${env.t("app.gw_points")}</span></div></div>` +
      `<div class="onb-feature__veil">${cell("app.average")}${cell("app.highest")}${cell("app.total")}</div>` +
      `</section>`
    );
  };
  /** FantasyHubRound's three tiles: Valeur, Banque, Rang. */
  SK.summaryTiles = (env) =>
    `<dl class="onb-grid2" style="grid-template-columns:repeat(3,1fr)">${[
      "app.value",
      "app.bank",
      "app.rank",
    ]
      .map(
        (k) =>
          `<div class="onb-surface" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 4px;text-align:center"><dt class="onb-t-label onb-muted">${env.t(k)}</dt><dd>${bar(44, 20)}</dd></div>`,
      )
      .join("")}</dl>`;
  SK.transfersRow = (env) =>
    `<div class="onb-surface onb-listrow" style="min-height:56px;border:0">` +
    `<span class="onb-disc">${ONB.icon("swap")}</span><span class="onb-grow"><span class="onb-t-strong" style="display:block">${env.t("app.transfers")}</span>` +
    `<span class="onb-t-meta onb-muted" style="display:flex;flex-wrap:wrap;align-items:center;gap:0 6px">${env.t("app.free_transfers")} ${bar(14, 11)} · ${env.t("app.bank")} ${bar(30, 11)}</span></span>` +
    `<span class="onb-muted">${ONB.icon("chevron")}</span></div>`;
  SK.nextAction = (env) =>
    ONB.button(env.t("app.pick_team"), { kind: "primary", full: true, icon: "shirt" });
  /** Everything the hub shows above the card block, in the app's order. */
  SK.hubAbove = (env, opts = {}) =>
    `<div class="onb-flow" style="--gap:10px">${SK.deadlineCard(env, opts)}${SK.teamCard(env)}${SK.nextAction(env)}${SK.transfersRow(env)}<div class="onb-hub-anchor" style="margin-block-start:14px">${SK.summaryTiles(env)}</div></div>`;
  SK.shortcuts = (env) =>
    `<ul class="onb-grid2">${[
      ["calendar", "app.shortcut.fixtures"],
      ["sliders", "app.shortcut.fdr"],
      ["trending", "app.shortcut.stats"],
      ["star", "app.shortcut.top"],
    ]
      .map(
        ([i, k]) =>
          `<li class="onb-surface onb-row" style="--gap:10px;min-height:48px;padding:8px 10px"><span class="onb-disc">${ONB.icon(i, { size: 18 })}</span><span class="onb-t-meta" style="font-weight:800">${env.t(k)}</span></li>`,
      )
      .join("")}</ul>`;
  SK.leagues = (env) => {
    const group = (k, rows) =>
      `<p class="onb-t-label onb-muted" style="margin-block:14px 6px">${env.t(k)}</p>` +
      ONB.list(rows.map((r) => ONB.row({ title: r, trail: bar(26, 14), chevron: true })));
    return (
      ONB.section(env.t("app.my_leagues"), "") +
      group("app.general_leagues", [
        env.t("app.overall"),
        `${env.t("app.gameweek")} ${ONB.num(env.ctx.nextGw ?? 5, env)}`,
      ]) +
      group("app.private_leagues", [bar(110, 14)]) +
      `<div class="onb-btnrow" style="margin-block-start:12px">${ONB.button(env.t("app.join_leagues"), { kind: "soft" })}${ONB.button(env.t("app.configure_leagues"), { kind: "soft" })}</div>`
    );
  };
  SK.hubBelow = (env) =>
    `<div class="onb-flow" style="--gap:24px">${SK.shortcuts(env)}<div>${SK.leagues(env)}</div></div>`;
  /** The team page's pitch: turf, four lines of plates (neutral). */
  SK.pitch = (env, { h = 360 } = {}) => {
    const plate = `<span class="onb-plate"><span class="onb-plate__shirt"><i></i></span><span class="onb-plate__name"></span><span class="onb-plate__fig"></span></span>`;
    const line = (n) => `<div class="onb-turf__line">${plate.repeat(n)}</div>`;
    return `<div class="onb-turf" style="height:${h}px" aria-hidden="true"><div class="onb-turf__rows">${line(2)}${line(4)}${line(4)}${line(1)}</div></div>`;
  };
})();
