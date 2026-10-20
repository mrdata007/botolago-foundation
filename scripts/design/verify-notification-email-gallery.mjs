// Local preview verification only; no email sending or shared database access.
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
const root = resolve(process.argv[2] ?? "/workspace/artifacts/botolago-notification-email-options"),
  catalog = JSON.parse(await readFile(root + "/catalog.json", "utf8"));
const browser = await chromium.launch({
  executablePath:
    process.env.E2E_CHROMIUM_PATH ??
    (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  args: ["--no-sandbox"],
});
const observations = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    (process.env.EMAIL_OPTIONS_URL ?? "http://127.0.0.1:4391/options/") + "index.html",
    { waitUntil: "load" },
  );
  if ((await page.locator("#options article").count()) !== 5) throw Error("Expected five options");
  if ((await page.locator("button[aria-pressed=true]").count()) !== 0)
    throw Error("No default should be selected");
  for (const [index, email] of catalog.entries()) {
    await page.selectOption("#email-type", email.type);
    const choice = (index % 5) + 1;
    await page
      .locator("#options .choose")
      .nth(choice - 1)
      .click();
    if ((await page.locator("#options button[aria-pressed=true]").count()) !== 1)
      throw Error("Choice not unique");
    observations.push({ type: email.type, chosen: choice });
  }
  await page.reload({ waitUntil: "load" });
  if (!(await page.locator("#progress").innerText()).includes("8 of 8"))
    throw Error("Selections lost");
  for (const email of catalog) {
    await page.selectOption("#email-type", email.type);
    await page.selectOption("#language", "ar");
    for (const [index, v] of email.versions.entries()) {
      const f = page.frameLocator("#options iframe").nth(index);
      await f.locator("h1").waitFor();
      if ((await f.locator("html").getAttribute("dir")) !== "rtl")
        throw Error("wrong iframe language");
    }
  }
  await page.selectOption("#email-type", "gameweek_finalized");
  await page.selectOption("#language", "fr");
  await page.screenshot({ path: root + "/screenshots/gallery-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.selectOption("#width", "320");
  await page.screenshot({ path: root + "/screenshots/gallery-mobile.png", fullPage: true });
  const offscreen = await page.evaluate(() =>
    [...document.querySelectorAll("header,main,.toolbar,select,.option,.summary,button,textarea")]
      .filter((el) => el.getClientRects().length)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < -1 || r.right > innerWidth + 1;
      })
      .map((el) => el.tagName + ":" + el.getAttribute("class")),
  );
  if (offscreen.length) throw Error("Gallery overflow " + JSON.stringify(offscreen));
  const download = page.waitForEvent("download");
  await page.click("#download");
  const d = await download;
  await d.saveAs(root + "/tested-choices.json");
  const chosen = JSON.parse(await readFile(root + "/tested-choices.json", "utf8"));
  if (Object.keys(chosen.choices).length !== 8) throw Error("Incomplete export");
  await page.click("#reset");
  if (!(await page.locator("#progress").innerText()).startsWith("0 of 8"))
    throw Error("Reset failed");
  await page.reload({ waitUntil: "load" });
  if (await page.locator("button[aria-pressed=true]").count()) throw Error("Clear did not persist");
  if (errors.length) throw Error(JSON.stringify(errors));
  console.log(
    "PASS gallery: 8 independent choices, persistence, all 40 Arabic previews, desktop/mobile bounds, export and reset",
  );
  for (const version of catalog[0].versions)
    for (const language of ["fr", "ar"])
      for (const mode of ["inline-only", "images-blocked"]) {
        const p = await browser.newPage({ viewport: { width: 320, height: 1000 } });
        if (mode === "images-blocked") await p.route("**/assets/**", (route) => route.abort());
        await p.goto(
          (process.env.EMAIL_OPTIONS_URL ?? "http://127.0.0.1:4391/options/") +
            version.files[language],
          { waitUntil: "load" },
        );
        if (mode === "inline-only")
          await p.locator("style").evaluateAll((nodes) => nodes.forEach((n) => n.remove()));
        const state = await p.evaluate(() => ({
          width: innerWidth,
          boxes: [...document.querySelectorAll("td,h1,a,img")]
            .filter((el) => el.getClientRects().length)
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { left: r.left, right: r.right, text: el.textContent?.trim().slice(0, 60) };
            }),
          cta: document.querySelector("[data-email-cta]").getBoundingClientRect().height,
          brand: document.body.innerText.includes("BotolaGO"),
        }));
        if (state.boxes.some((b) => b.left < -1 || b.right > 321) || state.cta < 44 || !state.brand)
          throw Error("Fallback failure " + version.id + "/" + language + "/" + mode);
        observations.push({ version: version.id, language, mode, pass: true });
        await p.close();
      }
  console.log("PASS 20 fallbacks: five designs, French/Arabic, no media CSS or blocked images");
} finally {
  await writeFile(root + "/gallery-verification.json", JSON.stringify(observations, null, 2));
  await browser.close();
}
