/**
 * The share picture with a crest, drawn by the app's own code in Chromium on a development server
 * in the mock data modes (nothing reads or writes a database): the « rated » fixture's card with
 * a crest served as `test-crest.png` by a small server this script starts on another origin
 * (`http://127.0.0.1:4388`, which `crestHref` admits as a local address):
 *
 *   - with `Access-Control-Allow-Origin: *` (`cors`): the crest is drawn and the canvas exports;
 *   - without it (`nocors`): the CORS load fails and the picture keeps the initials;
 *
 * in French and Arabic. Writes `screenshots/share-<cors|nocors>-<lang>.png` and prints whether a
 * PNG came back.
 *
 *   BASE=http://127.0.0.1:4377 node docs/engineering/tasks/manager-card-club-crest/share-check.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { ctxFor, go, launch } from "../../../product/manager-card-sorare-style/wp4/lib.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const crestPng = readFileSync(here("./test-crest.png"));
// a real second origin: a browser-level route would answer CORS requests with its own headers
const crestServer = createServer((req, res) => {
  const cors = req.url?.includes("cors=1");
  res.writeHead(200, {
    "Content-Type": "image/png",
    ...(cors ? { "Access-Control-Allow-Origin": "*" } : {}),
  });
  res.end(crestPng);
}).listen(4388, "127.0.0.1");
const browser = await launch();
const out = [];
for (const mode of ["cors", "nocors"])
  for (const lang of ["fr", "ar"]) {
    const ctx = await ctxFor(browser, { lang, theme: "dark", width: 390, height: 844, dpr: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
    await go(page, `/curva/carte?mc=rated`, lang);
    const crest = `http://127.0.0.1:4388/rca.png?cors=${mode === "cors" ? 1 : 0}`;
    const result = await page.evaluate(
      async ([lang, crest]) => {
        const share = await import("/src/components/manager-card/moments/card-share-image.ts");
        const { eclatRenderer } = await import("/src/components/manager-card/eclat/index.ts");
        const { dictionaries } = await import("/src/i18n/dictionaries.ts");
        const { fromMyCard } = await import("/src/components/manager-card/to-profile.ts");
        const { FIXTURES } = await import("/src/backend/manager-card/fixtures.ts");
        const base = fromMyCard(FIXTURES.rated.card);
        const profile = { ...base, club: { ...base.club, crest } };
        try {
          const blob = await share.drawCardShareImage({
            profile,
            throughGameweekSeq: 7,
            lang,
            t: (key) => dictionaries[lang][key] ?? key,
            renderer: eclatRenderer,
          });
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let bin = "";
          for (const b of bytes) bin += String.fromCharCode(b);
          return { ok: true, type: blob.type, size: blob.size, b64: btoa(bin) };
        } catch (error) {
          return { ok: false, error: String(error) };
        }
      },
      [lang, crest],
    );
    if (result.ok) {
      writeFileSync(
        here(`./screenshots/share-${mode}-${lang}.png`),
        Buffer.from(result.b64, "base64"),
      );
    }
    out.push({ mode, lang, ok: result.ok, type: result.type, size: result.size, errors });
    await ctx.close();
  }
await browser.close();
crestServer.close();
console.log(JSON.stringify(out, null, 1));
