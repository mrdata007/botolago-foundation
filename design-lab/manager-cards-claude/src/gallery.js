/* Gallery: collection, detail sheet, leaderboard test, critique, refined top 3,
   comparison with the Codex exploration and the final top five. No network, no storage
   beyond two remembered toggles (wrapped; the page works without them). */
(function () {
  const MC = window.MC;
  const R = () => window.MC.REVIEW || {};
  const $ = (s, el = document) => el.querySelector(s);
  const esc = MC.esc;

  /* ---------- chrome strings ---------- */
  const UI = {
    en: {
      title: "Manager Card",
      subtitle: "Exploration B · Claude",
      tabs: { collection: "Collection", leaderboard: "Leaderboard test", critique: "Critique", refined: "Refined top 3", codex: "vs Codex", top5: "Final top 5", about: "About" },
      ground: { night: "Night", day: "Day" },
      cats: { all: "All", safe: "Safe", bold: "Bold", youth: "Youth / status", wildcard: "Wildcard" },
      introQ: "What should a BotolaGO Manager Card look like if we want people to care about owning it for years?",
      intro: "Ten directions, each with its own silhouette, material and way of carrying the 84. Same fictional manager everywhere: ALI, 84 OVR, PRO, Founder 2026. Open any card for the large version, all five tiers, the leaderboard and comment sizes, the share image, advantages and risks.",
      open: "Open",
      prev: "Previous concept",
      next: "Next concept",
      close: "Close",
      notesLang: "Design notes are in English.",
      sections: { idea: "Design explanation", belonging: "Why people would care", founder: "Founder 2026 mark", small: "At small sizes", rtl: "Arabic and right-to-left", tiers: "Tier evolution", legend: "At LEGEND", adv: "Advantages", risks: "Risks", lives: "Where it lives", scores: "Critique scores", verdict: "Critic's verdict" },
      lives: { appLight: "Ranking card · light", appDark: "Ranking card · dark", rows: "Its own compact rows", mini: "Comment and head-to-head", ladder: "Token sizes", share: "Share image (story 9:16)" },
      tierNote: "ALI's data held constant; only the tier material changes.",
      version: { v1: "First pass", v2: "Refined" },
      motion: "Motion",
      pending: "Pending: this section fills in after the critique phase.",
    },
    ar: {
      title: "بطاقة المدرب",
      subtitle: "الاستكشاف ب · Claude",
      tabs: { collection: "المجموعة", leaderboard: "اختبار الترتيب", critique: "التقييم", refined: "أفضل 3 بعد التحسين", codex: "مقارنة مع Codex", top5: "الترتيب النهائي", about: "عن الاستكشاف" },
      ground: { night: "ليلي", day: "نهاري" },
      cats: { all: "الكل", safe: "آمن", bold: "جريء", youth: "شباب ومكانة", wildcard: "رهان" },
      introQ: "كيف يجب أن تبدو بطاقة مدرب BotolaGO إذا أردنا أن يعتز الناس بامتلاكها لسنوات؟",
      intro: "عشرة اتجاهات، لكل منها شكلها الخارجي ومادتها وطريقتها في حمل الرقم 84. المدرب نفسه في كل مكان: علي، 84، محترف، عضو مؤسس 2026. افتح أي بطاقة لرؤية النسخة الكبيرة والمستويات الخمسة وأحجام الترتيب والتعليقات وصورة المشاركة والمزايا والمخاطر.",
      open: "فتح",
      prev: "التصميم السابق",
      next: "التصميم التالي",
      close: "إغلاق",
      notesLang: "ملاحظات التصميم بالإنجليزية.",
      sections: { idea: "شرح التصميم", belonging: "لماذا سيهتم الناس", founder: "علامة العضو المؤسس 2026", small: "في الأحجام الصغيرة", rtl: "العربية والكتابة من اليمين", tiers: "تطور المستويات", legend: "في مستوى الأسطورة", adv: "المزايا", risks: "المخاطر", lives: "أين تظهر", scores: "درجات التقييم", verdict: "حكم المقيّم" },
      lives: { appLight: "بطاقة الترتيب · فاتح", appDark: "بطاقة الترتيب · داكن", rows: "صفوفها المختصرة", mini: "تعليق ومواجهة", ladder: "أحجام الشارة", share: "صورة المشاركة (قصة 9:16)" },
      tierNote: "بيانات علي ثابتة؛ تتغير مادة المستوى فقط.",
      version: { v1: "النسخة الأولى", v2: "بعد التحسين" },
      motion: "الحركة",
      pending: "قيد الانتظار: يكتمل هذا القسم بعد مرحلة التقييم.",
    },
  };

  /* ---------- state ---------- */
  const store = {
    get(k, d) {
      try {
        return localStorage.getItem("mc-claude-" + k) || d;
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("mc-claude-" + k, v);
      } catch {}
    },
  };
  // The ground follows the viewer's theme (data-theme on the root, else the OS setting)
  // until the viewer picks Night or Day here.
  const sysGround = () => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "light") return "day";
    if (t === "dark") return "night";
    return matchMedia("(prefers-color-scheme: light)").matches ? "day" : "night";
  };
  const storedGround = store.get("ground", null);
  const state = {
    lang: store.get("lang", "en"),
    ground: storedGround || sysGround(),
    groundManual: !!storedGround,
    filter: "all",
    detail: null, // concept id
    tier: "PRO",
    version: "v2",
    motion: true,
  };
  const T = () => UI[state.lang];
  const cardLang = () => (state.lang === "ar" ? "ar" : "lat");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- concept access ---------- */
  const all = () => MC.concepts.filter((c) => !c.hidden);
  const originals = () => all().filter((c) => !c.refinedFrom && !c.cut);
  const cutOnes = () => all().filter((c) => c.cut);
  const refinedOf = (id) => all().find((c) => c.refinedFrom === id);
  const byId = (id) => all().find((c) => c.id === id);
  const nameOf = (c) => (state.lang === "ar" && c.nameAr ? c.nameAr : c.name);
  const philOf = (c) => (state.lang === "ar" && c.philosophyAr ? c.philosophyAr : c.philosophy);
  const num = (c) => String(c.n).padStart(2, "0");
  const catLabel = (cat) => T().cats[cat] || cat;
  const catChip = (cat) => `<span class="cat cat-${cat}">${esc(catLabel(cat))}</span>`;

  function cardHTML(c, p = MC.ALI, o = {}) {
    try {
      return `<div class="card-slot" data-concept="${c.id}">${c.full(p, { lang: cardLang(), motion: false, ...o })}</div>`;
    } catch (e) {
      console.error(c.id, e);
      return `<div class="card-slot">Render error in ${esc(c.name)}</div>`;
    }
  }
  function mountAll(root) {
    if (reduced) return;
    root.querySelectorAll(".card-slot[data-live]").forEach((slot) => {
      const c = byId(slot.dataset.concept);
      if (c && typeof c.mount === "function") {
        try {
          c.mount(slot.firstElementChild, { lang: cardLang(), motion: state.motion });
        } catch (e) {
          console.error(e);
        }
      }
    });
  }

  /* ---------- top bar ---------- */
  const VIEWS = ["collection", "leaderboard", "critique", "refined", "codex", "top5", "about"];
  function renderChrome() {
    const html = document.documentElement;
    html.lang = state.lang === "ar" ? "ar" : "en";
    html.dir = state.lang === "ar" ? "rtl" : "ltr";
    html.dataset.ground = state.ground;
    $("#brandLogo").innerHTML = MC.logo("wordmark", { variant: state.ground === "day" ? "color" : "light" });
    document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = T()[el.dataset.i18n]));
    const view = currentView();
    $("#tabs").innerHTML = VIEWS.map(
      (v) => `<a class="tab" href="#${v}"${v === view ? ' aria-current="page"' : ""} style="display:inline-flex;align-items:center;text-decoration:none">${esc(T().tabs[v])}</a>`,
    ).join("");
    const seg = (items, cur, key) =>
      items.map((it) => `<button type="button" role="radio" aria-checked="${it.v === cur}" data-${key}="${it.v}">${esc(it.label)}</button>`).join("");
    $("#groundSeg").innerHTML = seg(
      [
        { v: "night", label: T().ground.night },
        { v: "day", label: T().ground.day },
      ],
      state.ground,
      "ground",
    );
    $("#langSeg").innerHTML = seg(
      [
        { v: "en", label: "EN" },
        { v: "ar", label: "ع" },
      ],
      state.lang,
      "lang",
    );
    $("#langSeg [data-lang='en']").setAttribute("aria-label", "English");
    $("#langSeg [data-lang='ar']").setAttribute("aria-label", "العربية");
  }

  /* ---------- views ---------- */
  function currentView() {
    const h = location.hash.replace(/^#\/?/, "");
    const v = h.split("/")[0];
    return VIEWS.includes(v) ? v : "collection";
  }

  function viewCollection() {
    const cats = ["all", "safe", "bold", "youth", "wildcard"];
    const list = originals().filter((c) => state.filter === "all" || c.category === state.filter);
    const count = (k) => (k === "all" ? originals().length : originals().filter((c) => c.category === k).length);
    return (
      `<section class="intro"><div><h1>${state.lang === "ar" ? "عشرة اتجاهات جديدة لبطاقة المدرب" : "Ten new directions for the Manager Card"}</h1><p class="q">${esc(T().introQ)}</p></div><p>${esc(T().intro)}</p></section>` +
      `<div class="filters" role="group" aria-label="${state.lang === "ar" ? "تصفية" : "Filter"}">${cats
        .map((k) => `<button type="button" class="chip" data-filter="${k}" aria-pressed="${state.filter === k}">${esc(catLabel(k))} <i>${count(k)}</i></button>`)
        .join("")}</div>` +
      `<div class="grid">${list
        .map((c) => {
          const v2 = refinedOf(c.id);
          return (
            `<a class="tile" href="#${c.id}" aria-label="${esc(num(c) + " " + nameOf(c))}">` +
            `<div class="tile-head"><span class="tile-n">${num(c)}</span><span class="tile-name">${esc(nameOf(c))}</span>${catChip(c.category)}</div>` +
            `<div class="stage" style="--card-w:${c.gridWidth || 236}px">${cardHTML(c)}</div>` +
            `<p class="tile-phil">${esc(philOf(c))}</p>` +
            `<div class="tile-foot">${v2 ? `<span class="badge-v2">${state.lang === "ar" ? "نسخة محسّنة" : "Refined"}</span>` : ""}<span class="tile-tok" aria-hidden="true">` +
            [44, 28].map((h) => `<span style="display:grid;place-items:center;height:${h}px;min-width:${h}px">${c.token(MC.ALI, { lang: cardLang(), size: h, mini: h <= 32 })}</span>`).join("") +
            `</span></div></a>`
          );
        })
        .join("")}</div>` +
      (cutOnes().length && state.filter === "all"
        ? `<section class="sec cut-sec"><h2>${state.lang === "ar" ? "ملحق: اتجاهات حُذفت" : "Appendix: directions that were cut"}</h2><p>${
            state.lang === "ar"
              ? "بُنيت هذه الاتجاهات قبل أن يرفضها المقيّمون. تبقى هنا كدليل على ما جُرّب ولماذا لم يُعتمد."
              : "These were built before the adversarial critics rejected them. They stay here as evidence of what was tried and why it was not kept."
          }</p></section><div class="grid cut-grid">${cutOnes()
            .map(
              (c) =>
                `<div class="tile tile-cut"><div class="tile-head"><span class="tile-name">${esc(nameOf(c))}</span>${catChip(c.category)}</div>` +
                `<div class="stage" style="--card-w:${Math.round((c.gridWidth || 236) * 0.8)}px;min-height:300px">${cardHTML(c)}</div>` +
                `<p class="tile-phil">${esc(philOf(c))}</p><p class="tile-phil" lang="en" dir="ltr"><b>Why it was cut:</b> ${esc(c.cutReason || "")}</p></div>`,
            )
            .join("")}</div>`
        : "")
    );
  }

  function viewLeaderboard() {
    const o = { lang: cardLang() };
    const ar = state.lang === "ar";
    return (
      `<div class="sec"><h2>${ar ? "اختبار الأحجام الصغيرة" : "The small-size test"}</h2><p>${
        ar
          ? "هل يبقى الحمض النووي البصري لكل بطاقة واضحًا بين 80 و24 بكسل؟ كل سطر يعرض الشارة بستة أحجام وصف علي المختصر كما تتخيله البطاقة."
          : "Does each concept's visual DNA survive between 80 and 24 pixels? Each line shows the token at six sizes and ALI's compact row as the concept would draw it."
      }</p></div>` +
      `<div class="lb-matrix">${originals()
        .map((c) => {
          const cc = refinedOf(c.id) || c;
          return `<div class="lb-line"><h3>${num(c)} ${esc(nameOf(c))}<small>${esc(catLabel(c.category))}${cc !== c ? (ar ? " · محسّنة" : " · refined") : ""}</small></h3><div style="display:grid;gap:14px">${MC.ctxLadder(cc, o)}<div class="${state.ground === "day" ? "app-light" : "app-dark"}" style="background:none">${MC.ctxSilhouette(cc, o)}</div></div><div class="${state.ground === "day" ? "app-light" : "app-dark"}" style="background:none">${cc.row(MC.ALI, { ...o, rank: 3, pts: 1196, me: true })}</div></div>`;
        })
        .join("")}</div>` +
      `<div class="sec"><h2>${ar ? "داخل التطبيق" : "Inside the app"}</h2><p>${
        ar ? "بطاقة الترتيب الحالية في BotolaGO مع شارة كل اتجاه بحجم 44 بكسل، بين مدربين بمستويات مختلفة." : "BotolaGO's own ranking card with each direction's token at 44px, among managers of different tiers (fictional sample managers)."
      }</p></div>` +
      `<div class="lb-phones">${originals()
        .map((c) => {
          const cc = refinedOf(c.id) || c;
          const theme = c.n % 2 ? "app-light" : "app-dark";
          return `<div class="lb-phone ${theme}" ${ar ? 'dir="rtl" lang="ar"' : ""}><h4>${num(c)} ${esc(nameOf(c))}</h4>${MC.ctxRankCard(cc, { ...o, tokenH: 28 })}</div>`;
        })
        .join("")}</div>`
    );
  }

  const CRITERIA = [
    "Originality",
    "BotolaGO ownership",
    "Football connection",
    "Moroccan relevance",
    "Youth appeal",
    "Adult appeal",
    "Status / flex",
    "Collectibility",
    "Readability",
    "Mobile scalability",
    "Social shareability",
    "Tier progression",
    "Long-term brand",
  ];
  const total = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) * 10) / 10;

  function viewCritique() {
    const rv = R();
    if (!rv.scores) return `<div class="sec"><h2>${esc(T().tabs.critique)}</h2><p>${esc(T().pending)}</p></div>`;
    const rows = originals()
      .map((c) => ({ c, s: rv.scores[c.id] }))
      .filter((r) => r.s)
      .sort((a, b) => total(b.s) - total(a.s));
    const cell = (v) => `<td class="sc ${v >= 8 ? "sc-hi" : v <= 5 ? "sc-lo" : ""}">${v}</td>`;
    return (
      `<div class="sec"><h2>${state.lang === "ar" ? "التقييم العدائي" : "Adversarial critique"}</h2><p>${esc(rv.method || "")}</p></div>` +
      `<div class="score-wrap"><table class="scores"><caption class="note" style="caption-side:bottom;padding:10px">${esc(rv.scaleNote || "")}</caption><thead><tr><th scope="col" style="text-align:start">Concept</th>${CRITERIA.map((k) => `<th scope="col">${esc(k)}</th>`).join("")}<th scope="col">Total /130</th></tr></thead><tbody>${rows
        .map((r) => `<tr><th scope="row"><a href="#${r.c.id}" style="color:inherit">${num(r.c)} ${esc(nameOf(r.c))}</a></th>${r.s.map(cell).join("")}<td class="total">${total(r.s)}</td></tr>`)
        .join("")}</tbody></table></div>` +
      (rv.superlatives
        ? `<div class="sec"><h2>${state.lang === "ar" ? "الأفضل في كل فئة" : "Superlatives"}</h2></div><div class="supers">${rv.superlatives
            .map((s) => {
              const c = byId(s.id);
              return `<div class="super"><div style="display:grid;place-items:center;height:64px">${c ? c.token(MC.ALI, { lang: cardLang(), size: 56 }) : ""}</div><div><b>${esc(s.label)}</b><strong>${c ? num(c) + " " + esc(nameOf(c)) : esc(s.id)}</strong><p>${esc(s.why)}</p></div></div>`;
            })
            .join("")}</div>`
        : "") +
      (rv.top3Reasoning
        ? `<div class="sec"><h2>${state.lang === "ar" ? "اختيار أفضل ثلاثة" : "Choosing the top three"}</h2></div><div class="prose" lang="en" dir="ltr"><p>${esc(rv.top3Reasoning)}</p></div>`
        : "") +
      (rv.critiqueNotes ? `<div class="sec"><h2>${state.lang === "ar" ? "ما وجده التقييم" : "What the critique found"}</h2></div><div class="prose" lang="en" dir="ltr">${rv.critiqueNotes}</div>` : "")
    );
  }

  function pairCols(left, right) {
    return `<div class="pair-col"><h3>${left.title}</h3>${left.body}</div><div class="pair-col"><h3>${right.title}</h3>${right.body}</div>`;
  }

  function viewRefined() {
    const rv = R();
    if (!rv.refined) return `<div class="sec"><h2>${esc(T().tabs.refined)}</h2><p>${esc(T().pending)}</p></div>`;
    const o = { lang: cardLang() };
    return (
      `<div class="sec"><h2>${state.lang === "ar" ? "النسخة الأولى مقابل النسخة المحسّنة" : "First pass versus refined"}</h2><p>${esc(rv.refinedIntro || "")}</p></div>` +
      rv.refined
        .map((r) => {
          const a = byId(r.id);
          const b = byId(r.v2);
          if (!a || !b) return "";
          const block = (c) =>
            `<div class="stage" style="--card-w:300px">${cardHTML(c)}</div><div style="display:flex;gap:18px;align-items:center;justify-content:center;margin-block:12px">${[56, 32, 24]
              .map((h) => `<span style="display:grid;place-items:center;height:${h}px;min-width:${h}px">${c.token(MC.ALI, { ...o, size: h, mini: h <= 32 })}</span>`)
              .join("")}</div><div class="app-dark" style="padding:12px;border-radius:14px">${c.row(MC.ALI, { ...o, rank: 3, pts: 1196, me: true })}</div>`;
          return (
            `<article class="pair" aria-label="${esc(a.name)}">` +
            pairCols({ title: `${num(a)} ${esc(nameOf(a))} · ${esc(T().version.v1)}`, body: block(a) }, { title: `${num(a)} ${esc(nameOf(a))} · ${esc(T().version.v2)}`, body: block(b) }) +
            `<div class="pair-notes" lang="en" dir="ltr">${(r.groups || [])
              .map((g) => `<div><h4>${esc(g.title)}</h4><ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`)
              .join("")}</div></article>`
          );
        })
        .join("")
    );
  }

  function viewCodex() {
    const rv = R();
    const cx = rv.codex;
    if (!cx) return `<div class="sec"><h2>${esc(T().tabs.codex)}</h2><p>${esc(T().pending)}</p></div>`;
    return (
      `<div class="sec"><h2>${state.lang === "ar" ? "مقارنة مع استكشاف Codex" : "Against the Codex exploration"}</h2><p>${esc(cx.intro || "")}</p></div>` +
      (cx.pairs || [])
        .map((pr) => {
          const c = byId(pr.claude);
          return (
            `<article class="pair">` +
            pairCols(
              { title: `Codex #${pr.codexRank} · ${esc(pr.codexName)}`, body: `<div class="stage" style="min-height:420px">${pr.codexImg ? `<img class="codex-img" src="${pr.codexImg}" alt="Codex ${esc(pr.codexName)} card, screenshot of PR #377">` : ""}</div>${pr.codexCompactImg ? `<img class="codex-img" style="max-width:380px;margin-top:12px" src="${pr.codexCompactImg}" alt="Codex ${esc(pr.codexName)} leaderboard identity">` : ""}` },
              { title: c ? `Claude · ${num(c)} ${esc(nameOf(c))}` : "Claude", body: c ? `<div class="stage" style="min-height:420px;--card-w:300px">${cardHTML(c)}</div><div class="app-dark" style="padding:12px;border-radius:14px;margin-top:12px">${c.row(MC.ALI, { lang: cardLang(), rank: 3, pts: 1196, me: true })}</div>` : "" },
            ) +
            `<div class="pair-notes" lang="en" dir="ltr"><div><h4>${esc(pr.title || "Verdict")}</h4>${(pr.text || []).map((t) => `<p style="margin:0 0 8px;color:var(--g-muted)">${esc(t)}</p>`).join("")}</div></div></article>`
          );
        })
        .join("") +
      (cx.rankingOpinion ? `<div class="sec"><h2>${state.lang === "ar" ? "رأي في ترتيب Codex" : "On Codex's ranking"}</h2></div><div class="prose" lang="en" dir="ltr">${cx.rankingOpinion}</div>` : "")
    );
  }

  function viewTop5() {
    const rv = R();
    if (!rv.top5) return `<div class="sec"><h2>${esc(T().tabs.top5)}</h2><p>${esc(T().pending)}</p></div>`;
    return (
      `<div class="sec"><h2>${state.lang === "ar" ? "أفضل خمس بطاقات عبر الاستكشافين" : "Final top five across both explorations"}</h2><p>${esc(rv.top5Intro || "")}</p></div>` +
      `<div class="top5">${rv.top5
        .map((t) => {
          const c = t.source === "claude" ? byId(t.id) : null;
          const art = c ? cardHTML(c) : t.img ? `<img class="codex-img" src="${t.img}" alt="${esc(t.name)} (Codex), screenshot">` : "";
          return `<article class="t5"><div class="t5-rank">${t.rank}</div><div class="stage" style="--card-w:200px">${art}</div><div><span class="who">${t.source === "claude" ? "Claude" : "Codex · PR #377"}</span><h3>${esc(c ? num(c) + " " + nameOf(c) : t.name)}</h3><p lang="en" dir="ltr">${esc(t.why)}</p></div></article>`;
        })
        .join("")}</div>`
    );
  }

  function viewAbout() {
    const rv = R();
    return `<div class="sec"><h2>${esc(T().tabs.about)}</h2></div><div class="prose" lang="en" dir="ltr">${rv.about || ""}</div>`;
  }

  /* ---------- detail ---------- */
  function liveConcept(id) {
    const base = byId(id);
    const v2 = refinedOf(id);
    return state.version === "v2" && v2 ? v2 : base;
  }
  function openDetail(id) {
    const base = byId(id);
    if (!base) return;
    state.detail = id;
    renderDetail();
    const d = $("#detail");
    if (!d.open) d.showModal();
    $(".d-scroll", d).scrollTop = 0;
  }
  function renderDetail() {
    const d = $("#detail");
    const base = byId(state.detail);
    const c = liveConcept(state.detail);
    const v2 = refinedOf(state.detail);
    const list = originals();
    const i = list.findIndex((x) => x.id === state.detail);
    const prev = list[(i - 1 + list.length) % list.length];
    const next = list[(i + 1) % list.length];
    const o = { lang: cardLang() };
    const ar = state.lang === "ar";
    const S = T().sections;
    const rv = R();
    const scores = rv.scores && rv.scores[base.id];
    const verdict = rv.verdicts && rv.verdicts[base.id];
    const arrow = (dir) =>
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir === "prev" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}"/></svg>`;
    const para = (t) => (Array.isArray(t) ? t : [t]).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join("");
    d.innerHTML =
      `<div class="d-bar"><span class="crumb">${num(base)} / ${String(list.length).padStart(2, "0")} · ${esc(nameOf(base))}</span>` +
      `<a class="icon-btn dir" href="#${prev.id}" aria-label="${esc(T().prev)}">${arrow("prev")}</a>` +
      `<a class="icon-btn dir" href="#${next.id}" aria-label="${esc(T().next)}">${arrow("next")}</a>` +
      `<button type="button" class="icon-btn" data-close aria-label="${esc(T().close)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>` +
      `<div class="d-scroll"><div class="d-body">` +
      `<div class="d-left">` +
      (v2
        ? `<div class="seg ver-seg" role="radiogroup" aria-label="Version">${["v1", "v2"].map((v) => `<button type="button" role="radio" aria-checked="${state.version === v}" data-version="${v}">${esc(T().version[v])}</button>`).join("")}</div>`
        : "") +
      `<div class="d-stage"><div class="card-slot" data-concept="${c.id}" data-live style="width:min(100%, ${c.detailWidth || 380}px)">${c.full(MC.withTier(state.tier), { ...o, motion: state.motion })}</div></div>` +
      `<div class="d-controls"><div class="seg" role="radiogroup" aria-label="Tier">${MC.TIERS.map((t) => `<button type="button" role="radio" aria-checked="${state.tier === t}" data-tier="${t}">${esc(MC.s(o).tiers[t])}</button>`).join("")}</div></div>` +
      `<p class="note" style="margin:0;text-align:center">${esc(T().tierNote)}</p>` +
      `</div>` +
      `<div class="d-right"><h2 id="dTitle"><span class="d-n">${num(base)}</span> ${esc(nameOf(base))}</h2><p class="lead">${esc(philOf(c))}</p><div class="d-meta">${catChip(base.category)}</div>` +
      (ar ? `<p class="note">${esc(T().notesLang)}</p>` : "") +
      `<div lang="en" dir="ltr">` +
      `<div class="d-sec"><h3>${esc(S.idea)}</h3>${para(c.idea)}</div>` +
      `<div class="d-sec"><h3>${esc(S.belonging)}</h3>${para(c.belonging)}</div>` +
      `<div class="d-sec"><h3>${esc(S.founder)}</h3>${para(c.founderMark)}</div>` +
      `<div class="d-sec"><h3>${esc(S.tiers)}</h3><div class="tier-strip">${MC.TIERS.map(
        (t) =>
          `<button type="button" data-tier="${t}" aria-pressed="${state.tier === t}" aria-label="${t}"><div class="card-slot">${c.full(MC.withTier(t), { ...o, motion: false, thumb: true })}</div><span>${t}</span></button>`,
      ).join("")}</div><div class="tier-lines">${MC.TIERS.map((t) => `<div><b>${t}</b><span>${esc((c.tiers || {})[t] || "")}</span></div>`).join("")}</div></div>` +
      `<div class="d-sec"><h3>${esc(S.legend)}</h3>${para(c.legend)}</div>` +
      `<div class="d-sec"><h3>${esc(S.small)}</h3>${para(c.small)}</div>` +
      `<div class="d-sec"><h3>${esc(S.rtl)}</h3>${para(c.rtl)}</div>` +
      `<div class="d-sec"><h3>${esc(S.adv)}</h3><ul>${(c.advantages || []).map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` +
      `<div class="d-sec"><h3>${esc(S.risks)}</h3><ul>${(c.risks || []).map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>` +
      (scores
        ? `<div class="d-sec"><h3>${esc(S.scores)} · ${total(scores)}/130</h3><div class="scorebars">${CRITERIA.map((k, j) => `<div><span>${esc(k)}</span><b>${scores[j]}</b><i style="--v:${scores[j]}"></i></div>`).join("")}</div>${verdict ? `<p style="margin-top:14px"><b>${esc(S.verdict)}:</b> ${esc(verdict)}</p>` : ""}</div>`
        : "") +
      `</div></div>` +
      `<div style="grid-column:1/-1"><div class="d-sec"><h3>${esc(S.lives)}</h3><div class="lives">` +
      `<div class="app-light" ${ar ? 'dir="rtl" lang="ar"' : ""}><h4>${esc(T().lives.appLight)}</h4>${MC.ctxRankCard(c, { ...o, tokenH: 28 })}</div>` +
      `<div class="app-dark" ${ar ? 'dir="rtl" lang="ar"' : ""}><h4>${esc(T().lives.appDark)}</h4>${MC.ctxRankCard(c, { ...o, tokenH: 28 })}</div>` +
      `<div class="app-light" ${ar ? 'dir="rtl" lang="ar"' : ""}><h4>${esc(T().lives.rows)}</h4><div class="ctx-rows">${MC.ctxRows(c, o)}</div></div>` +
      `<div class="app-dark" ${ar ? 'dir="rtl" lang="ar"' : ""}><h4>${esc(T().lives.rows)}</h4><div class="ctx-rows">${MC.ctxRows(c, o)}</div></div>` +
      `<div class="app-light" ${ar ? 'dir="rtl" lang="ar"' : ""}><h4>${esc(T().lives.mini)}</h4><div style="display:grid;gap:12px">${MC.ctxMini(c, { ...o, miniH: 28 })}</div></div>` +
      `<div class="app-dark" ${ar ? 'dir="rtl" lang="ar"' : ""}><h4>${esc(T().lives.ladder)}</h4>${MC.ctxLadder(c, o)}</div>` +
      `</div></div>` +
      `<div class="d-sec"><h3>${esc(T().lives.share)}</h3><div class="share-wrap">` +
      [{ lang: "lat" }, { lang: "ar" }]
        .map((so) => `<div class="share-frame" ${so.lang === "ar" ? 'dir="rtl" lang="ar"' : ""}><div class="share-in">${c.share(MC.ALI, so)}</div></div>`)
        .join("") +
      `</div></div></div>` +
      `</div></div>`;
    mountAll(d);
  }

  /* ---------- render + events ---------- */
  function render() {
    renderChrome();
    const v = currentView();
    const main = $("#main");
    const views = { collection: viewCollection, leaderboard: viewLeaderboard, critique: viewCritique, refined: viewRefined, codex: viewCodex, top5: viewTop5, about: viewAbout };
    main.innerHTML = views[v]();
    mountAll(main);
    const m = location.hash.match(/^#\/?(?:c\/)?(c\d\d)$/);
    const d = $("#detail");
    if (m) openDetail(m[1]);
    else if (d.open) d.close();
    document.documentElement.dataset.ready = "1";
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) return;
    if (t.dataset.ground) {
      state.ground = t.dataset.ground;
      state.groundManual = true;
      store.set("ground", state.ground);
      render();
    } else if (t.dataset.lang) {
      state.lang = t.dataset.lang;
      store.set("lang", state.lang);
      render();
    } else if (t.dataset.filter) {
      state.filter = t.dataset.filter;
      render();
    } else if (t.dataset.tier) {
      state.tier = t.dataset.tier;
      renderDetail();
    } else if (t.dataset.version) {
      state.version = t.dataset.version;
      renderDetail();
    } else if (t.hasAttribute("data-close")) {
      $("#detail").close();
    }
  });
  $("#detail").addEventListener("close", () => {
    state.detail = null;
    state.tier = "PRO";
    if (/^#\/?(?:c\/)?c\d\d$/.test(location.hash)) history.replaceState(null, "", "#collection");
    renderChrome();
    const tile = document.querySelector(`.tile[href="#${lastOpened}"]`);
    if (tile) tile.focus();
  });
  let lastOpened = null;
  window.addEventListener("hashchange", () => {
    const m = location.hash.match(/^#\/?(?:c\/)?(c\d\d)$/);
    if (m) {
      lastOpened = m[1];
      state.tier = "PRO";
      if (!document.querySelector(".tile")) render();
      openDetail(m[1]);
      renderChrome();
    } else {
      render();
      window.scrollTo(0, 0);
    }
  });
  document.addEventListener("keydown", (e) => {
    const d = $("#detail");
    if (!d.open) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      if (e.target.closest("[role=radiogroup]")) return;
      const list = originals();
      const i = list.findIndex((x) => x.id === state.detail);
      const forward = (e.key === "ArrowRight") !== (state.lang === "ar");
      const n = list[(i + (forward ? 1 : -1) + list.length) % list.length];
      location.hash = `#${n.id}`;
    }
  });

  const followSystem = () => {
    if (state.groundManual) return;
    const g = sysGround();
    if (g !== state.ground) {
      state.ground = g;
      render();
    }
  };
  try {
    matchMedia("(prefers-color-scheme: light)").addEventListener("change", followSystem);
  } catch {}
  new MutationObserver(followSystem).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  document.documentElement.dataset.ground = state.ground;
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(render);
})();
