import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4407";
const PAGES = [
  ["home", "/"],
  ["matches", "/matches"],
  ["profile", "/profile"],
  ["fantasy-hub", "/fantasy"],
  ["fantasy-rules", "/fantasy/rules"],
];
const VIEWPORTS = [
  ["390", { width: 390, height: 844 }],
  ["1440", { width: 1440, height: 900 }],
];
const LANGS = ["fr", "ar"];

const results = [];

const browser = await chromium.launch();

for (const lang of LANGS) {
  for (const [vpName, viewport] of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
    await ctx.addInitScript(
      ([l]) => {
        try {
          window.localStorage.setItem("botolago.language", l);
          window.localStorage.setItem("botolago.theme", "light");
          window.localStorage.setItem("botolago.welcomed", "1");
        } catch {
          /* ignore */
        }
      },
      [lang],
    );
    const page = await ctx.newPage();

    for (const [pageName, path] of PAGES) {
      const id = `${pageName} ${vpName} ${lang}`;
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45000 });
      } catch {
        try {
          await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 45000 });
        } catch (e) {
          results.push({ id, error: String(e).slice(0, 200) });
          continue;
        }
      }
      await page.waitForTimeout(1200);

      const found = await page.evaluate((vw) => {
        const out = {
          dir: document.documentElement.getAttribute("dir"),
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
          overflowingElements: [],
          letterSpacedArabic: [],
          smallTapTargets: [],
          clippedText: [],
          centredArabicBlocks: 0,
          arabicTextNodes: 0,
          mirror: null,
        };

        // Does the layout genuinely mirror, or is it merely centred?
        // The first heading inside <main> should hug the inline-start edge:
        // the left gutter in LTR, the right gutter in RTL. A centred layout
        // leaves roughly equal slack on both sides, which this catches.
        {
          const main = document.querySelector("main") || document.body;
          const h = main.querySelector("h1, h2");
          if (h) {
            const hr = h.getBoundingClientRect();
            const mr = main.getBoundingClientRect();
            out.mirror = {
              startGap: Math.round(
                document.documentElement.getAttribute("dir") === "rtl"
                  ? mr.right - hr.right
                  : hr.left - mr.left,
              ),
              endGap: Math.round(
                document.documentElement.getAttribute("dir") === "rtl"
                  ? hr.left - mr.left
                  : mr.right - hr.right,
              ),
              textAlign: getComputedStyle(h).textAlign,
              text: (h.textContent || "").trim().slice(0, 24),
            };
          }
        }

        const isScroller = (el) => {
          const s = getComputedStyle(el);
          return (
            s.overflowX === "auto" ||
            s.overflowX === "scroll" ||
            s.overflow === "auto" ||
            s.overflow === "scroll"
          );
        };
        const insideScroller = (el) => {
          let n = el.parentElement;
          while (n && n !== document.body) {
            if (isScroller(n)) return true;
            n = n.parentElement;
          }
          return false;
        };
        const label = (el) => {
          const cls = (el.className && String(el.className).slice(0, 60)) || "";
          const txt = (el.textContent || "").trim().slice(0, 30);
          return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}[${cls}] "${txt}"`;
        };

        const ARABIC = /[؀-ۿ]/;

        for (const el of document.querySelectorAll("body *")) {
          const s = getComputedStyle(el);
          if (s.display === "none" || s.visibility === "hidden") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;

          // 1. anything sticking past the viewport, excluding deliberate
          //    horizontal scrollers and their contents
          if (
            (r.right > vw + 1 || r.left < -1) &&
            !isScroller(el) &&
            !insideScroller(el) &&
            s.position !== "fixed"
          ) {
            if (out.overflowingElements.length < 8)
              out.overflowingElements.push({
                el: label(el),
                left: Math.round(r.left),
                right: Math.round(r.right),
              });
          }

          const text = (el.textContent || "").trim();
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join("")
            .trim();

          // 2. letter-spacing on Arabic text
          if (ownText && ARABIC.test(ownText)) {
            out.arabicTextNodes += 1;
            if (s.letterSpacing !== "normal" && s.letterSpacing !== "0px") {
              if (out.letterSpacedArabic.length < 8)
                out.letterSpacedArabic.push({ el: label(el), letterSpacing: s.letterSpacing });
            }
          }

          // 3. clipped / truncated meaningful text
          if (
            ownText.length > 2 &&
            (s.textOverflow === "ellipsis" || s.overflow === "hidden") &&
            !el.classList.contains("sr-only") &&
            el.scrollWidth > el.clientWidth + 1 &&
            !isScroller(el)
          ) {
            if (out.clippedText.length < 12)
              out.clippedText.push({
                el: label(el),
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
              });
          }

          // 4. tap targets
          const interactive =
            el.matches("a[href], button, [role=button], [role=tab], input, select, textarea") &&
            !el.hasAttribute("disabled") &&
            !el.closest("[aria-hidden=true]");
          if (interactive && (r.height < 44 || r.width < 44)) {
            // ignore purely decorative zero-text controls inside a larger hit area
            if (out.smallTapTargets.length < 20)
              out.smallTapTargets.push({
                el: label(el),
                w: Math.round(r.width),
                h: Math.round(r.height),
              });
          }
        }
        return out;
      }, viewport.width);

      results.push({ id, page: pageName, viewport: vpName, lang, ...found });
    }
    await ctx.close();
  }
}
await browser.close();
writeFileSync(
  "/tmp/claude-0/-home-user-botolago-foundation/38c9c6aa-d4bc-540b-8674-7cdb622e23bb/scratchpad/verify.json",
  JSON.stringify(results, null, 2),
);

for (const r of results) {
  if (r.error) {
    console.log(`${r.id}: ERROR ${r.error}`);
    continue;
  }
  const hScroll = r.docScrollWidth > r.docClientWidth;
  console.log(
    `${r.id.padEnd(26)} dir=${r.dir} hscroll=${hScroll ? "YES(" + r.docScrollWidth + ">" + r.docClientWidth + ")" : "no"} overflow=${r.overflowingElements.length} arabicLS=${r.letterSpacedArabic.length}/${r.arabicTextNodes} clipped=${r.clippedText.length} smallTaps=${r.smallTapTargets.length} mirror=${r.mirror ? `start:${r.mirror.startGap} end:${r.mirror.endGap} align:${r.mirror.textAlign}` : "n/a"}`,
  );
}
