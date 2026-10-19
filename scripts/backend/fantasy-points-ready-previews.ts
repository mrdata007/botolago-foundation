// Local files only: no database, recipient list or sending credentials.
// bun scripts/backend/fantasy-points-ready-previews.ts <output-dir>
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  POINTS_READY_VARIANTS,
  renderPointsReadyEmail,
} from "../../supabase/functions/_shared/fantasy-points-ready-email";
import { escapeHtml as e } from "../../supabase/functions/_shared/notification-email-render";

const output = resolve(process.argv[2] ?? "/workspace/artifacts/botolago-points-ready-emails");
await mkdir(`${output}/assets`, { recursive: true });
await mkdir("public/email", { recursive: true });
for (const tone of ["color", "light"] as const) {
  const svg = await readFile(`src/assets/brand/botolago-wordmark-${tone}.svg`);
  const png = await sharp(svg, { density: 144 }).resize({ width: 588 }).png().toBuffer();
  await writeFile(`${output}/assets/botolago-wordmark-${tone}.png`, png);
  await writeFile(`public/email/botolago-wordmark-${tone}.png`, png);
}
const cards: string[] = [];
const metadata: object[] = [];
for (const variant of POINTS_READY_VARIANTS) {
  for (const language of ["fr", "ar"] as const) {
    const email = renderPointsReadyEmail({
      language,
      variant,
      state: "finalized",
      pendingPlayers: 0,
      gameweek: 4,
      points: 76,
      totalPoints: 284,
      overallRank: 128,
      managerName: language === "ar" ? "أمين" : "Amine",
      appUrl: "https://botolago.com",
      unsubscribeUrl: "https://botolago.com/unsubscribe?token=PREVIEW_NOT_A_REAL_TOKEN",
    });
    const file = `${variant}.${language}`;
    await writeFile(
      `${output}/${file}.html`,
      email.html.replaceAll("https://botolago.com/email/", "assets/"),
    );
    await writeFile(
      `${output}/${file}.txt`,
      `${email.subject}\n${email.preheader}\n\n${email.text}`,
    );
    metadata.push({
      variant,
      language,
      subject: email.subject,
      preheader: email.preheader,
      sampleData: true,
    });
    cards.push(
      `<article><h2>${e(variant)} · ${language.toUpperCase()}</h2><p><strong>${e(email.subject)}</strong></p><p>${e(email.preheader)}</p><p><a href="${file}.html">Open email</a> · <a href="${file}.txt">Plain text</a></p><iframe title="${e(variant)} ${language}" src="${file}.html"></iframe></article>`,
    );
  }
}
await writeFile(`${output}/metadata.json`, JSON.stringify(metadata, null, 2));
await writeFile(
  `${output}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BotolaGO · Points-ready email review</title><style>body{margin:0;padding:28px;background:#f5f7f9;color:#0c3164;font:16px/1.5 Arial,sans-serif}main{max-width:1400px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}article{min-width:0}h1{font-size:30px}h2{font-size:18px}iframe{width:100%;height:1160px;border:1px solid #e5e8ec;border-radius:16px;background:white}a{color:#0c3164}</style><main><h1>Points ready. Three ways to say it.</h1><p>Review only · Fictional sample: GW4, 76 points, season total 284, rank 128. These are not live results. Preview unsubscribe tokens do not work.</p><p>1. <b>Score reveal</b> (recommended): lead with the moment and a large score.<br>2. <b>Manager report</b>: a cleaner, analytical scorecard.<br>3. <b>Full time</b>: celebrate the end of the round with a scoreboard.</p><div class="grid">${cards.join("")}</div></main></html>`,
);
console.log(`Created six HTML and plain-text previews in ${output}`);
