/** Local fictional previews only: no provider, database, or recipient lookup. */
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { sampleDelivery } from "../backend/notification-email-previews";
import {
  renderNotificationEmail,
  escapeHtml as e,
} from "../../supabase/functions/_shared/notification-email-render";
import {
  EMAIL_NOTIFICATION_TYPES,
  type RenderedEmail,
} from "../../supabase/functions/_shared/notification-email-types";
import { renderTeamReminderEmail } from "../../supabase/functions/_shared/fantasy-team-reminder-email";
import {
  APPROVED_POINTS_READY_VARIANT,
  renderPointsReadyEmail,
} from "../../supabase/functions/_shared/fantasy-points-ready-email";

const output = resolve(process.argv[2] ?? "/workspace/artifacts/botolago-club-emails");
await mkdir(output + "/assets", { recursive: true });
await copyFile(
  "public/email/botolago-wordmark-light.png",
  output + "/assets/botolago-wordmark-light.png",
);
const entries: { id: string; language: "fr" | "ar"; email: RenderedEmail }[] = [];
for (const language of ["fr", "ar"] as const) {
  for (const type of EMAIL_NOTIFICATION_TYPES)
    entries.push({
      id: `generic.${type}.${language}`,
      language,
      email: renderNotificationEmail(sampleDelivery(type, language), {
        appUrl: "https://botolago.com",
      }),
    });
  const common = {
    language,
    gameweek: 5,
    managerName: language === "ar" ? "أمين" : "Amine",
    appUrl: "https://botolago.com",
    unsubscribeUrl: "https://botolago.com/unsubscribe?token=PREVIEW_NOT_A_REAL_TOKEN",
  };
  for (const kind of ["selection-open", "deadline-reminder"] as const)
    entries.push({
      id: `automated.${kind}.${language}`,
      language,
      email: renderTeamReminderEmail({
        ...common,
        kind,
        selectionState: "open",
        deadlineConfirmed: true,
        opensAt: "2026-10-22T08:00:00Z",
        deadlineAt: "2026-10-25T18:00:00Z",
        now: kind === "selection-open" ? "2026-10-22T08:00:00Z" : "2026-10-24T18:00:00Z",
      }),
    });
  for (const points of [76, 0, -4, 123456])
    entries.push({
      id: `automated.points-${points}.${language}`,
      language,
      email: renderPointsReadyEmail({
        ...common,
        variant: APPROVED_POINTS_READY_VARIANT,
        state: "finalized",
        pendingPlayers: 0,
        points,
        totalPoints: points === 76 ? 284 : null,
        overallRank: points === 76 ? 128 : null,
      }),
    });
}
for (const entry of entries)
  await writeFile(
    `${output}/${entry.id}.html`,
    entry.email.html.replaceAll("https://botolago.com/email/", "assets/"),
  );
await writeFile(output + "/rendered.json", JSON.stringify(entries, null, 2));
await writeFile(
  output + "/index.html",
  `<!DOCTYPE html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BotolaGO · Club email previews</title><style>body{margin:24px auto;padding:0 16px;max-width:1100px;color:#0c3164;background:#f5f7f9;font:16px/1.6 Arial,sans-serif}li{margin:12px 0}a{color:#0c3164}summary{cursor:pointer}iframe{display:block;width:100%;height:1000px;border:0;margin:12px 0}</style><h1>Club notification emails</h1><p>Fictional examples, including zero/negative scores and legacy templates. No email is sent.</p><ul>${entries.map(({ id, language, email }) => `<li><a href="${id}.html" lang="${language}">${e(id)} · ${e(email.subject)}</a><details><summary>Preview</summary><iframe loading="lazy" sandbox title="${e(id)}" src="${id}.html"></iframe></details></li>`).join("")}</ul></html>`,
);
console.log(`Wrote ${entries.length} fictional Club preview cases to ${output}. No email sent.`);
