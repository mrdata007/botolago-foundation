// Renders every notification e-mail variant (6 types x French/Arabic) from
// realistic sample data, for review in a browser.
//
//   bun scripts/backend/notification-email-previews.ts <output-dir>
//
// Writes `<type>.<language>.html` per variant plus an `index.html` listing
// each subject, preheader and plain-text body. Local files only: no network,
// no database.

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  escapeHtml,
  renderNotificationEmail,
} from "../../supabase/functions/_shared/notification-email-render";
import {
  EMAIL_NOTIFICATION_TYPES,
  type ClaimedEmailDelivery,
  type EmailFixture,
  type EmailLanguage,
  type EmailLinkContext,
  type EmailNotificationType,
  type EmailPayloadByType,
  type EmailTeam,
} from "../../supabase/functions/_shared/notification-email-types";

const LINKS: EmailLinkContext = { appUrl: "https://botolago.com" };
const LANGUAGES: readonly EmailLanguage[] = ["fr", "ar"];

// Arabic names as in scripts/backend/football-team-arabic-names-seed.sql.
function team(id: string, fr: string, ar: string, shortFr: string, shortAr: string): EmailTeam {
  return { id, name: { fr, ar }, shortName: { fr: shortFr, ar: shortAr } };
}

const T = {
  raja: team("team-raja", "Raja Casablanca", "الرجاء الرياضي", "Raja", "الرجاء"),
  wydad: team("team-wydad", "Wydad Casablanca", "الوداد الرياضي", "Wydad", "الوداد"),
  far: team("team-far", "AS FAR", "الجيش الملكي", "FAR", "الجيش"),
  berkane: team("team-berkane", "RS Berkane", "نهضة بركان", "Berkane", "نهضة بركان"),
  fus: team("team-fus", "FUS Rabat", "الفتح الرياضي", "FUS", "الفتح"),
  mas: team("team-mas", "Maghreb Fès", "نادي المغرب الرياضي الفاسي", "MAS", "المغرب الفاسي"),
  husa: team("team-husa", "Hassania Agadir", "حسنية أكادير", "HUSA", "حسنية أكادير"),
  irt: team("team-irt", "Ittihad Tanger", "اتحاد طنجة", "IRT", "اتحاد طنجة"),
  mat: team("team-mat", "Moghreb Tétouan", "نادي المغرب أتلتيك تطوان", "MAT", "المغرب التطواني"),
  dhj: team("team-dhj", "Difaâ El Jadida", "الدفاع الحسني الجديدي", "DHJ", "الدفاع الجديدي"),
  kacm: team("team-kacm", "Kawkab Marrakech", "الكوكب المراكشي", "KACM", "الكوكب المراكشي"),
  codm: team("team-codm", "CODM Meknès", "النادي المكناسي", "CODM", "المكناسي"),
  uts: team("team-uts", "Union Touarga", "اتحاد تواركة", "UTS", "اتحاد تواركة"),
  ait: team("team-ait", "Amal Tiznit", "أمل تيزنيت", "AIT", "أمل تيزنيت"),
  wat: team("team-wat", "Wydad Témara", "نادي الوداد الرياضي لتمارة", "WAT", "وداد تمارة"),
  rcaz: team("team-rcaz", "RCA Zemamra", "نادي النهضة أتلتيك الزمامرة", "RCAZ", "نهضة الزمامرة"),
} as const;

let fixtureSeq = 0;
function fixture(
  home: EmailTeam,
  away: EmailTeam,
  kickoffAt: string,
  options: Partial<Pick<EmailFixture, "timeConfirmed" | "status" | "homeScore" | "awayScore">> = {},
): EmailFixture {
  fixtureSeq += 1;
  return {
    id: `fx-${String(fixtureSeq).padStart(4, "0")}`,
    kickoffAt,
    timeConfirmed: options.timeConfirmed ?? true,
    status: options.status ?? "not_started",
    home,
    away,
    homeScore: options.homeScore ?? null,
    awayScore: options.awayScore ?? null,
  };
}

const finished = (homeScore: number, awayScore: number) =>
  ({ status: "finished", homeScore, awayScore }) as const;

// Saturday 26 September 2026: the Casablanca derby, and a match whose kickoff
// time the provider has not confirmed yet (its 00:00 UTC placeholder).
const MATCHDAY_DATE = "2026-09-26";
const derby = fixture(T.raja, T.wydad, "2026-09-26T20:00:00Z");
const matchdayFixtures: EmailFixture[] = [
  fixture(T.fus, T.mas, "2026-09-26T15:00:00Z"),
  fixture(T.far, T.berkane, "2026-09-26T17:00:00Z"),
  derby,
  fixture(T.husa, T.irt, "2026-09-26T00:00:00Z", { timeConfirmed: false }),
];
const resultsFixtures: EmailFixture[] = [
  { ...matchdayFixtures[0]!, ...finished(1, 3) },
  { ...matchdayFixtures[1]!, ...finished(0, 0) },
  { ...derby, ...finished(2, 1) },
  { ...matchdayFixtures[3]!, status: "postponed" },
];

// Journée 6, Friday 2 – Sunday 4 October: one time to confirm, one postponed.
const round6Fixtures: EmailFixture[] = [
  fixture(T.mat, T.dhj, "2026-10-02T17:00:00Z"),
  fixture(T.wydad, T.fus, "2026-10-02T19:00:00Z"),
  fixture(T.kacm, T.codm, "2026-10-03T15:00:00Z"),
  fixture(T.mas, T.raja, "2026-10-03T19:00:00Z"),
  fixture(T.uts, T.ait, "2026-10-03T00:00:00Z", { timeConfirmed: false }),
  fixture(T.berkane, T.husa, "2026-10-04T16:00:00Z"),
  fixture(T.irt, T.far, "2026-10-04T19:00:00Z"),
  fixture(T.wat, T.rcaz, "2026-10-04T00:00:00Z", { timeConfirmed: false, status: "postponed" }),
];

const PAYLOADS: { readonly [K in EmailNotificationType]: EmailPayloadByType[K] } = {
  matchday_preview: { date: MATCHDAY_DATE, fixtures: matchdayFixtures },
  matchday_results: { date: MATCHDAY_DATE, fixtures: resultsFixtures },
  round_preview: {
    round: { id: "round-6", number: 6, name: "Journée 6" },
    fixtures: round6Fixtures,
  },
  match_starting: { fixture: round6Fixtures[3]!, minutes: 60 },
  // 90 minutes before the round's first kickoff (Friday 17:00 UTC).
  deadline_24h: {
    gameweek: { id: "gw-6", sequence: 6, name: "Journée 6" },
    deadlineAt: "2026-10-02T15:30:00Z",
  },
  gameweek_finalized: { gameweek: 5, points: 64, overallRank: 1287, totalPoints: 312 },
};

export function sampleDelivery(
  type: EmailNotificationType,
  language: EmailLanguage,
): ClaimedEmailDelivery {
  return {
    id: `delivery-${type}-${language}`,
    notificationId: `notification-${type}`,
    attemptNumber: 1,
    language,
    timezone: "Africa/Casablanca",
    recipient: {
      email: "supporter@example.com",
      displayName: language === "ar" ? "ياسين" : "Yassine",
    },
    favoriteTeamId: T.raja.id,
    unsubscribeToken: "sample-token/with+chars=",
    type,
    payload: PAYLOADS[type],
  } as ClaimedEmailDelivery;
}

function indexHtml(
  entries: readonly {
    file: string;
    lang: EmailLanguage;
    type: string;
    subject: string;
    preheader: string;
    text: string;
  }[],
): string {
  const rows = entries
    .map((entry) => {
      const dir = entry.lang === "ar" ? "rtl" : "ltr";
      return [
        "<tr>",
        `<td><a href="${escapeHtml(entry.file)}">${escapeHtml(entry.type)}</a></td>`,
        `<td>${entry.lang}</td>`,
        `<td lang="${entry.lang}" dir="${dir}"><strong>${escapeHtml(entry.subject)}</strong><br><span class="pre">${escapeHtml(entry.preheader)}</span>`,
        `<details><summary>Plain text</summary><pre dir="${dir}">${escapeHtml(entry.text)}</pre></details></td>`,
        "</tr>",
      ].join("");
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BotolaGO notification e-mails</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#060d1a;background:#f5f7f9}
table{border-collapse:collapse;width:100%;background:#fff}
td,th{border:1px solid #e5e8ec;padding:8px 10px;vertical-align:top;text-align:start}
.pre{color:#4e5661;font-size:13px}
pre{white-space:pre-wrap;font-size:13px;background:#f5f7f9;padding:8px}
</style>
</head>
<body>
<h1>BotolaGO notification e-mails</h1>
<p>${entries.length} variants rendered from sample data. Favourite club: Raja Casablanca. Time zone: Africa/Casablanca.</p>
<table>
<thead><tr><th>Type</th><th>Lang</th><th>Subject, preheader and plain text</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`;
}

export async function writePreviews(outputDir: string): Promise<string[]> {
  const dir = resolve(outputDir);
  await mkdir(dir, { recursive: true });
  const entries = [];
  for (const type of EMAIL_NOTIFICATION_TYPES) {
    for (const lang of LANGUAGES) {
      const rendered = renderNotificationEmail(sampleDelivery(type, lang), LINKS);
      const file = `${type}.${lang}.html`;
      await writeFile(resolve(dir, file), rendered.html, "utf8");
      entries.push({ file, lang, type, ...rendered });
    }
  }
  await writeFile(resolve(dir, "index.html"), indexHtml(entries), "utf8");
  return [...entries.map((entry) => entry.file), "index.html"];
}

if (import.meta.main) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error("usage: bun scripts/backend/notification-email-previews.ts <output-dir>");
    process.exit(1);
  }
  const files = await writePreviews(outputDir);
  console.log(`Wrote ${files.length} files to ${resolve(outputDir)}`);
}
