// Local previews only. Fictional fixtures/times/results; no database or sending.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  APPROVED_POINTS_READY_VARIANT,
  renderPointsReadyEmail,
} from "../../supabase/functions/_shared/fantasy-points-ready-email";
import { renderTeamReminderEmail } from "../../supabase/functions/_shared/fantasy-team-reminder-email";
import { escapeHtml as e } from "../../supabase/functions/_shared/notification-email-render";

const output = resolve(process.argv[2] ?? "/workspace/artifacts/botolago-manager-emails");
await mkdir(`${output}/assets`, { recursive: true });
await writeFile(
  `${output}/assets/botolago-wordmark-light.png`,
  await readFile("public/email/botolago-wordmark-light.png"),
);
const metadata: object[] = [];
const cards: string[] = [];
for (const kind of ["selection-open", "deadline-reminder", "points-ready"] as const) {
  for (const language of ["fr", "ar"] as const) {
    const common = {
      language,
      gameweek: 5,
      managerName: language === "ar" ? "أمين" : "Amine",
      appUrl: "https://botolago.com",
      unsubscribeUrl: "https://botolago.com/unsubscribe?token=PREVIEW_NOT_A_REAL_TOKEN",
    };
    const email =
      kind === "points-ready"
        ? renderPointsReadyEmail({
            ...common,
            variant: APPROVED_POINTS_READY_VARIANT,
            state: "finalized",
            pendingPlayers: 0,
            points: 76,
            totalPoints: 284,
            overallRank: 128,
          })
        : renderTeamReminderEmail({
            ...common,
            kind,
            selectionState: "open",
            deadlineConfirmed: true,
            opensAt: "2026-10-22T08:00:00Z",
            deadlineAt: "2026-10-25T18:00:00Z",
            now: kind === "selection-open" ? "2026-10-22T08:00:00Z" : "2026-10-24T18:00:00Z",
          });
    const filename = `${kind}.${language}`;
    await writeFile(
      `${output}/${filename}.html`,
      email.html.replaceAll("https://botolago.com/email/", "assets/"),
    );
    await writeFile(
      `${output}/${filename}.txt`,
      `${email.subject}\n${email.preheader}\n\n${email.text}`,
    );
    metadata.push({
      kind,
      language,
      subject: email.subject,
      preheader: email.preheader,
      sampleData: true,
    });
    cards.push(
      `<article><h2>${e(kind)} · ${language.toUpperCase()}</h2><p>${e(email.subject)}</p><a href="${filename}.html">Open email</a> · <a href="${filename}.txt">Plain text</a><iframe title="${kind} ${language}" src="${filename}.html"></iframe></article>`,
    );
  }
}
await writeFile(`${output}/metadata.json`, JSON.stringify(metadata, null, 2));
await writeFile(
  `${output}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BotolaGO manager email journey</title><style>body{margin:0;padding:24px;background:#f5f7f9;color:#0c3164;font:16px/1.5 Arial,sans-serif}main{max-width:1400px;margin:auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}article{min-width:0}iframe{width:100%;height:1200px;border:1px solid #ddd;border-radius:16px}</style><main><h1>Your selected manager email journey</h1><p>Score reveal approved. Two matching reminders: when selection opens and before the confirmed deadline. Fictional sample: GW5, deadline 25 October 2026 at 18:00 Morocco time, 76 points. These are not real fixtures or results. No email is sent.</p><div class="grid">${cards.join("")}</div></main></html>`,
);
console.log(`Created six approved-journey previews in ${output}; no emails sent.`);
