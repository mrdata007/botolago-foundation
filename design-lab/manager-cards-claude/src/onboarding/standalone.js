/* The single built page: a toolbar (direction, language, theme, motion, screen filter) over the
   grid MC.ONB.page.render draws. A published page cannot read its query string, so every choice
   is a control and the grid re-renders in place. A query string still sets the starting state
   when there is one (c, v, lang, scheme, motion, screen), so the file also works when opened
   by hand. Nothing is loaded: every direction module is already in the page. */
(function () {
  const MC = window.MC;
  const ONB = MC.ONB;
  const esc = MC.esc;

  /* [file slug, module id, label] in the order of the plan: the lead first. */
  const DIRS = [
    ["07-v2", "c07-v2", "Écharpe v2 (the lead)"],
    ["03-v2", "c03-v2", "Porte-clés v2"],
    ["01", "c01", "Lucarne"],
    ["05-v2", "c05-v2", "Semelle v2 (cultural test pending)"],
    ["t1-touchline", "t1", "Touchline (reworked)"],
  ];
  const q = new URLSearchParams(location.search);
  const slugOf = (c, v) => (c ? c + (v ? "-" + v : "") : "");
  const dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const state = {
    dir: DIRS.some((d) => d[0] === slugOf(q.get("c"), q.get("v")))
      ? slugOf(q.get("c"), q.get("v"))
      : "07-v2",
    lang: q.get("lang") === "ar" ? "ar" : "fr",
    scheme: q.get("scheme")
      ? q.get("scheme") === "dark"
        ? "dark"
        : "light"
      : dark
        ? "dark"
        : "light",
    motion: q.get("motion") === "1",
    screen: q.get("screen") || "all",
  };
  const screens = ONB.SCREENS.filter((s) => s.id !== "S00");
  if (state.screen !== "all" && !screens.some((s) => s.id === state.screen)) state.screen = "all";

  const bar = document.getElementById("toolbar");
  const out = document.getElementById("out");

  const seg = (key, label, options) =>
    `<div class="onbt__group"><span class="onbt__label" id="onbt-${key}">${label}</span>` +
    `<div class="onbt__seg" role="group" aria-labelledby="onbt-${key}">` +
    options
      .map(
        ([v, text]) =>
          `<button type="button" data-key="${key}" data-value="${esc(String(v))}" aria-pressed="${String(state[key] === v)}">${esc(text)}</button>`,
      )
      .join("") +
    `</div></div>`;
  const select = (key, label, options) =>
    `<div class="onbt__group onbt__select-wide"><label class="onbt__label" for="onbt-${key}">${label}</label>` +
    `<select id="onbt-${key}" data-key="${key}">` +
    options
      .map(
        ([v, text]) =>
          `<option value="${esc(v)}"${state[key] === v ? " selected" : ""}>${esc(text)}</option>`,
      )
      .join("") +
    `</select></div>`;

  bar.className = "onbt";
  bar.innerHTML =
    `<h1 class="onbt__title">Onboarding screens <span>· Manager Card lab · fictional sample data, not a product screen</span></h1>` +
    select(
      "dir",
      "Direction",
      DIRS.map((d) => [d[0], d[2]]),
    ) +
    seg("lang", "Language", [
      ["fr", "FR"],
      ["ar", "AR"],
    ]) +
    seg("scheme", "Theme", [
      ["light", "Light"],
      ["dark", "Dark"],
    ]) +
    seg("motion", "Motion", [
      [false, "Off"],
      [true, "On"],
    ]) +
    select("screen", "Screen", [
      ["all", "All screens"],
      ...screens.map((s) => [s.id, `${s.id} · ${s.moment || ""} · ${s.title}`]),
    ]) +
    `<p class="onbt__status" role="status" aria-live="polite" id="onbt-status"></p>`;

  const fit = () => {
    const room = document.documentElement.clientWidth;
    const z = room < 390 ? room / 390 : 1;
    out.querySelectorAll(".onbp-cell:not(.onbp-cell--wide) .onbp-slot").forEach((s) => {
      s.style.zoom = z < 1 ? String(z) : "";
    });
  };

  let token = 0;
  const render = async () => {
    const mine = ++token;
    const d = DIRS.find((x) => x[0] === state.dir);
    const c = MC.concepts.find((x) => x.id === d[1]);
    out.setAttribute("aria-busy", "true");
    const frames = await ONB.page.render(out, {
      c,
      slug: state.dir,
      lang: state.lang,
      scheme: state.scheme,
      motion: state.motion,
      only: state.screen === "all" ? null : [state.screen],
      exclude: ["S00"],
    });
    if (mine !== token) return;
    out.removeAttribute("aria-busy");
    fit();
    document.getElementById("onbt-status").textContent =
      `${d[2]} · ${state.lang.toUpperCase()} · ${state.scheme} · motion ${state.motion ? "on" : "off"} · ` +
      `${state.screen === "all" ? "all screens" : state.screen}: ${frames.length} variants`;
    document.documentElement.dataset.ready = "1";
  };

  bar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-key]");
    if (!b) return;
    const key = b.dataset.key;
    const raw = b.dataset.value;
    state[key] = key === "motion" ? raw === "true" : raw;
    bar.querySelectorAll(`button[data-key="${key}"]`).forEach((x) => {
      x.setAttribute("aria-pressed", String(x === b));
    });
    render();
  });
  bar.addEventListener("change", (e) => {
    const s = e.target.closest("select[data-key]");
    if (!s) return;
    state[s.dataset.key] = s.value;
    render();
  });
  window.addEventListener("resize", fit);
  render();
})();
