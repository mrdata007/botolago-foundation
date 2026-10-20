/** Local design review only: no dispatcher, database, network data or sending. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { sampleDelivery } from "../backend/notification-email-previews";
import {
  renderNotificationEmail,
  escapeHtml as e,
} from "../../supabase/functions/_shared/notification-email-render";
import { renderTeamReminderEmail } from "../../supabase/functions/_shared/fantasy-team-reminder-email";
import {
  APPROVED_POINTS_READY_VARIANT,
  renderPointsReadyEmail,
} from "../../supabase/functions/_shared/fantasy-points-ready-email";
import type {
  EmailLanguage,
  EmailNotificationType,
} from "../../supabase/functions/_shared/notification-email-types";

const output = resolve(
  process.argv[2] ?? "/workspace/artifacts/botolago-notification-email-options",
);
const languages: EmailLanguage[] = ["fr", "ar"];
const types: { type: EmailNotificationType; label: string; fr: string; ar: string }[] = [
  {
    type: "matchday_preview",
    label: "Today's matches",
    fr: "Les matchs du jour",
    ar: "مباريات اليوم",
  },
  {
    type: "matchday_results",
    label: "Today's results",
    fr: "Les résultats du jour",
    ar: "نتائج اليوم",
  },
  {
    type: "round_preview",
    label: "Round preview",
    fr: "Le programme de la journée",
    ar: "برنامج الجولة",
  },
  {
    type: "match_starting",
    label: "Kick-off reminder",
    fr: "Le coup d’envoi approche",
    ar: "اقتربت صافرة البداية",
  },
  {
    type: "gameweek_opened",
    label: "Selection opens",
    fr: "La sélection est ouverte",
    ar: "اختيار التشكيلة متاح",
  },
  {
    type: "deadline_24h",
    label: "Selection deadline",
    fr: "Avant la date limite",
    ar: "قبل الموعد النهائي",
  },
  {
    type: "gameweek_finalized",
    label: "Fantasy points",
    fr: "Vos points Fantasy",
    ar: "نقاطك في الفانتازي",
  },
  {
    type: "pepites_weekly",
    label: "Prospects weekly",
    fr: "Prospects · Le Top 10",
    ar: "المواهب · أفضل 10 لاعبين",
  },
];
const designs = [
  {
    id: 1,
    name: "Club",
    description: "The app’s colours: navy masthead, cyan highlights and a rounded action.",
    canvas: "#f5f7f9",
    surface: "#ffffff",
    ink: "#0c3164",
    text: "#060d1a",
    muted: "#4e5661",
    tint: "#e9f3fe",
    rule: "#e5e8ec",
  },
  {
    id: 2,
    name: "Journal",
    description: "An editorial layout: white masthead, strong typography and fine rules.",
    canvas: "#ffffff",
    surface: "#ffffff",
    ink: "#0c3164",
    text: "#060d1a",
    muted: "#4e5661",
    tint: "#f5f7f9",
    rule: "#e5e8ec",
  },
  {
    id: 3,
    name: "Stadium",
    description: "The official stadium artwork leads into a spacious white reading area.",
    canvas: "#f5f7f9",
    surface: "#ffffff",
    ink: "#0c3164",
    text: "#060d1a",
    muted: "#4e5661",
    tint: "#e9f3fe",
    rule: "#e5e8ec",
  },
  {
    id: 4,
    name: "Ticket",
    description:
      "A match-ticket composition: event strip, perforated dividers and a compact action.",
    canvas: "#e9f3fe",
    surface: "#ffffff",
    ink: "#0c3164",
    text: "#060d1a",
    muted: "#4e5661",
    tint: "#f5f7f9",
    rule: "#e5e8ec",
  },
  {
    id: 5,
    name: "Scoreboard",
    description: "A dark scoreboard: cyan figures, data first and a contrasting action.",
    canvas: "#0c3164",
    surface: "#0c3164",
    ink: "#73edfa",
    text: "#ffffff",
    muted: "#d5e3f1",
    tint: "#0c3164",
    rule: "#4e739b",
  },
] as const;
type Design = (typeof designs)[number];
interface Model {
  title: string;
  kicker: string;
  dateline: string;
  prose: string[];
  panels: string[];
  blocks: { html: string; panel: boolean; heading: boolean }[];
  cta: { label: string; url: string };
  closing: string[];
  footer: string;
}
const table = (dir: string, body: string, style = "", extra = "") =>
  `<table role="presentation" dir="${dir}" width="100%" cellpadding="0" cellspacing="0" border="0" ${extra} style="width:100%;border-collapse:separate;border-spacing:0;${style}">${body}</table>`;
function source(type: EmailNotificationType, language: EmailLanguage) {
  const common = {
    language,
    managerName: language === "ar" ? "أمين" : "Amine",
    gameweek: 5,
    appUrl: "https://botolago.com",
    unsubscribeUrl: "https://botolago.com/unsubscribe?token=PREVIEW_NOT_A_REAL_TOKEN",
  };
  if (type === "gameweek_finalized")
    return renderPointsReadyEmail({
      ...common,
      variant: APPROVED_POINTS_READY_VARIANT,
      state: "finalized",
      pendingPlayers: 0,
      points: 76,
      totalPoints: 284,
      overallRank: 128,
    });
  if (type === "gameweek_opened" || type === "deadline_24h")
    return renderTeamReminderEmail({
      ...common,
      kind: type === "gameweek_opened" ? "selection-open" : "deadline-reminder",
      selectionState: "open",
      deadlineConfirmed: true,
      opensAt: "2026-10-22T08:00:00Z",
      deadlineAt: "2026-10-25T18:00:00Z",
      now: type === "gameweek_opened" ? "2026-10-22T08:00:00Z" : "2026-10-24T18:00:00Z",
    });
  return renderNotificationEmail(sampleDelivery(type, language), { appUrl: common.appUrl });
}
function documentHtml(
  model: Model,
  design: Design,
  language: EmailLanguage,
  category: string,
  subject: string,
  preheader: string,
) {
  const dir = language === "ar" ? "rtl" : "ltr",
    start = language === "ar" ? "right" : "left";
  const dark = design.id === 5,
    ticket = design.id === 4,
    journal = design.id === 2;
  const font =
    language === "ar" ? "'Segoe UI',Tahoma,Arial,sans-serif" : "Arial,Helvetica,sans-serif";
  const logo = (light: boolean, width = 168) =>
    `<a href="https://botolago.com" style="text-decoration:none;color:${light ? "#ffffff" : "#0c3164"};"><img src="assets/botolago-wordmark-${light ? "light" : "color"}.png" width="${width}" height="${Math.round((width * 105) / 588)}" alt="BotolaGO" style="display:inline-block;border:0;width:${width}px;max-width:100%;height:auto;vertical-align:middle;"></a>`;
  const wordmark = table(
    dir,
    `<tr><td align="${start}" style="padding:${journal ? "28px 0 22px" : "24px"};text-align:${start};">${logo(!journal && design.id !== 4)}${journal ? `<p style="margin:16px 0 0;font:700 12px/1.7 ${font};color:#4e5661;">${e(model.kicker)}</p>` : ""}</td></tr>`,
  );
  const header =
    design.id === 3
      ? `<tr><td bgcolor="#0c3164" style="background:#0c3164;border-radius:14px 14px 0 0;overflow:hidden;"><a href="https://botolago.com"><img src="assets/botolago-stadium.jpg" width="600" height="315" alt="BotolaGO" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:14px 14px 0 0;"></a></td></tr>`
      : `<tr><td bgcolor="${journal || ticket ? "#ffffff" : "#0c3164"}" style="background:${journal || ticket ? "#ffffff" : "#0c3164"};border-radius:${journal ? "0" : "14px 14px 0 0"};${journal ? "border-bottom:2px solid #0c3164;" : ""}">${wordmark}</td></tr>`;
  const kicker = `<p style="margin:0 0 12px;font-size:12px;line-height:1.7;font-weight:700;color:${dark ? "#73edfa" : "#0c3164"};">${e(model.kicker)}</p>`;
  const title = language === "fr" ? model.title.replace(/ ([!?;:])/g, "\u202f$1") : model.title;
  const heading = `<h1 class="email-title" style="margin:0;font-family:${font};font-size:${journal ? 32 : 30}px;line-height:${language === "ar" ? 1.55 : 1.25};font-weight:800;color:${design.text};overflow-wrap:break-word;">${e(title)}</h1>${model.dateline ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.8;color:${design.muted};">${e(model.dateline)}</p>` : ""}`;
  const labelStrip = ticket
    ? table(
        dir,
        `<tr><td style="padding:14px 24px;border-top:2px dashed #0c3164;border-bottom:2px dashed #0c3164;background:#73edfa;color:#0c3164;font-size:12px;line-height:1.8;font-weight:700;text-align:${start};">${e(category)}</td></tr>`,
      )
    : "";
  const firstData = model.blocks.findIndex((block) => block.panel || block.heading);
  const introduction = firstData < 0 ? model.blocks : model.blocks.slice(0, firstData);
  const dataGroup = firstData < 0 ? [] : model.blocks.slice(firstData);
  const orderedBody = model.blocks.map((block) => block.html).join("");
  const ctaColor = dark || design.id === 1 ? "#73edfa" : "#0c3164";
  const ctaText = dark || design.id === 1 ? "#0c3164" : "#ffffff";
  const action = table(
    dir,
    `<tr><td align="${journal ? start : "center"}" style="padding:28px 0 0;">${table(dir, `<tr><td align="center" bgcolor="${ctaColor}" style="background-color:${ctaColor};${design.id === 1 ? "background-image:linear-gradient(to bottom,#60fa97,#73edfa);" : ""}border-radius:${ticket ? "6px" : "28px"};"><a data-email-cta href="${e(model.cta.url)}" style="display:block;padding:16px 20px;min-height:24px;line-height:24px;font-family:${font};font-size:16px;font-weight:700;text-decoration:none;color:${ctaText};border-radius:${ticket ? "6px" : "28px"};overflow-wrap:break-word;">${e(model.cta.label)}</a></td></tr>`, journal ? "max-width:340px;" : "")}</td></tr>`,
  );
  const content =
    design.id === 5
      ? `${kicker}${heading}${introduction[0]?.html ?? ""}${dataGroup.map((block) => block.html).join("")}${introduction
          .slice(1)
          .map((block) => block.html)
          .join("")}${action}`
      : `${journal ? "" : kicker}${heading}${orderedBody}${action}`;
  return `<!DOCTYPE html>
<html lang="${language}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><title>${e(subject)}</title><style>body{margin:0;padding:0}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media only screen and (max-width:620px){.email-outer{padding:16px 8px!important}.email-content{padding:24px 20px!important}.email-title{font-size:28px!important}.email-footer{padding:22px 16px!important}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style></head>
<body dir="${dir}" bgcolor="${design.canvas}" style="margin:0;padding:0;width:100%;background-color:${design.canvas};font-family:${font};color:${design.text};"><div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${e(preheader)}${"&#8199;&#65279; ".repeat(35)}</div>
${table(
  dir,
  `<tr><td class="email-outer" align="center" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${table(dir, `${header}${ticket ? `<tr><td>${labelStrip}</td></tr>` : ""}<tr><td class="email-content" align="${start}" bgcolor="${design.surface}" style="background-color:${design.surface};padding:${journal ? "28px 0 32px" : "32px"};border-radius:0 0 ${journal ? "0" : "14px 14px"};${ticket ? "border-bottom:2px dashed #0c3164;" : ""}font-family:${font};font-size:16px;line-height:${language === "ar" ? "1.95" : "1.7"};color:${design.text};text-align:${start};">${content}${model.closing.join("")}</td></tr>`, "max-width:600px;margin:0 auto;table-layout:fixed;")}
${table(dir, `<tr><td class="email-footer" align="${start}" style="padding:24px 20px;font-family:${font};font-size:12px;line-height:1.8;color:${design.muted};text-align:${start};">${model.footer}</td></tr>`, "max-width:600px;margin:0 auto;table-layout:fixed;")}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>`,
  `background-color:${design.canvas};`,
)}</body></html>`;
}

await mkdir(output + "/assets", { recursive: true });
for (const name of ["botolago-wordmark-light.png", "botolago-wordmark-color.png"])
  await copyFile("public/email/" + name, output + "/assets/" + name);
await copyFile("public/og-image.jpg", output + "/assets/botolago-stadium.jpg");
const executablePath =
  process.env.E2E_CHROMIUM_PATH ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] });
const catalog = [];
const sourceAudit = [];
try {
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  for (const item of types) {
    const versions = designs.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      files: {} as Record<EmailLanguage, string>,
    }));
    for (const language of languages) {
      const rendered = source(item.type, language);
      await page.setContent(rendered.html, { waitUntil: "domcontentloaded" });
      const model: Model = await page.evaluate(() => {
        const generic = !!document.querySelector("td.bg-card");
        const cell = document.querySelector<HTMLElement>(generic ? "td.bg-card" : "td.content")!;
        const heading = cell.querySelector("h1")!;
        const siblings = Array.from(cell.children) as HTMLElement[];
        const before = siblings.slice(0, siblings.indexOf(heading));
        const after = siblings.slice(siblings.indexOf(heading) + 1);
        const greeting = after.findIndex((el) => /^(Bonjour|مرحب)/.test(el.textContent!.trim()));
        const data = after.slice(greeting);
        const cta = cell.querySelector<HTMLAnchorElement>("a[href]")!;
        const action = siblings.find((element) => element.contains(cta))!;
        const actionIndex = data.indexOf(action);
        const footer =
          document.querySelector(".email-footer") ??
          (generic
            ? cell.parentElement!.nextElementSibling!.querySelector("td")!
            : cell.closest("table")!.nextElementSibling!.querySelector("td")!);
        return {
          title: heading.textContent!.trim(),
          kicker: before.map((el) => el.textContent!.trim()).join(" "),
          dateline: after
            .slice(0, greeting)
            .map((el) => el.textContent!.trim())
            .join(" "),
          prose: data
            .slice(0, actionIndex)
            .filter((el) => el.tagName !== "TABLE")
            .map((el) => el.outerHTML),
          panels: data
            .slice(0, actionIndex)
            .filter((el) => el.tagName === "TABLE")
            .map((el) => el.outerHTML),
          blocks: data.slice(0, actionIndex).map((el) => ({
            html: el.outerHTML,
            panel: el.tagName === "TABLE",
            heading: el.tagName === "H2",
          })),
          cta: { label: cta.textContent!.trim(), url: cta.getAttribute("href")! },
          closing: data.slice(actionIndex + 1).map((el) => el.outerHTML),
          footer: footer.innerHTML,
        };
      });
      sourceAudit.push({
        type: item.type,
        language,
        subject: rendered.subject,
        preheader: rendered.preheader,
        text: rendered.text,
        model,
      });
      for (const design of designs) {
        // Inline visual treatment only; preserve every production word/link.
        const themed = await page.evaluate(
          ({ model, design, language }) => {
            const dark = design.id === 5;
            const themeFragment = (html: string, panel: boolean) => {
              const root = document.createElement("div");
              root.innerHTML = html;
              for (const node of root.querySelectorAll<HTMLElement>("*")) {
                if (node.style.fontFamily) node.style.removeProperty("font-family");
                if (node.tagName === "P") {
                  node.style.lineHeight = language === "ar" ? "1.95" : "1.7";
                  node.style.margin = panel ? "0 0 10px" : "18px 0 0";
                }
                if (node.style.color) {
                  const rgb = node.style.color;
                  node.style.color = dark
                    ? rgb === "rgb(78, 86, 97)"
                      ? design.muted
                      : rgb === "rgb(12, 49, 100)"
                        ? design.ink
                        : design.text
                    : rgb === "rgb(255, 255, 255)" || rgb === "rgb(115, 237, 250)"
                      ? design.ink
                      : rgb;
                }
                if (node.style.backgroundColor || node.hasAttribute("bgcolor")) {
                  const hero =
                    node.style.backgroundColor === "rgb(12, 49, 100)" ||
                    node.getAttribute("bgcolor") === "#0c3164" ||
                    node.style.backgroundColor === "rgb(115, 237, 250)";
                  const tinted = node.style.backgroundColor === "rgb(233, 243, 254)";
                  const fill = dark
                    ? design.surface
                    : hero
                      ? design.id === 1 || design.id === 4
                        ? "#73edfa"
                        : design.tint
                      : tinted
                        ? design.tint
                        : design.surface;
                  node.style.backgroundColor = fill;
                  node.setAttribute("bgcolor", fill);
                  if (hero) {
                    node.style.color = design.ink;
                    node.style.border = "1px solid " + design.rule;
                  }
                }
                if (node.style.borderColor) node.style.borderColor = design.rule;
                if (node.style.borderTopColor) node.style.borderTopColor = design.rule;
                if (node.style.borderBottomColor) node.style.borderBottomColor = design.rule;
                if (node.style.borderRadius && (design.id === 2 || design.id === 4))
                  node.style.borderRadius = design.id === 2 ? "0" : "6px";
                if (node.tagName === "SPAN" && node.style.borderRadius === "999px") {
                  node.style.backgroundColor = dark ? "#73edfa" : "#0c3164";
                  node.style.color = dark ? "#0c3164" : "#ffffff";
                }
                if (parseFloat(node.style.fontSize) >= 40) {
                  node.style.fontSize = design.id === 2 ? "60px" : "64px";
                  node.style.fontVariantNumeric = "tabular-nums";
                  node.style.color = design.ink;
                }
                if (node.tagName === "A") {
                  node.style.color = dark ? "#73edfa" : "#0c3164";
                  node.style.textDecoration = "underline";
                  node.style.display = "inline-block";
                  node.style.padding = "5px 0";
                }
              }
              const top = root.firstElementChild as HTMLElement;
              if (panel) {
                top.style.margin = "22px 0 0";
                top.style.tableLayout = "fixed";
              }
              return root.innerHTML;
            };
            return {
              ...model,
              prose: model.prose.map((h) => themeFragment(h, false)),
              panels: model.panels.map((h) => themeFragment(h, true)),
              blocks: model.blocks.map((block) => ({
                ...block,
                html: themeFragment(block.html, block.panel),
              })),
              closing: model.closing.map((h) => themeFragment(h, false)),
              footer: themeFragment(model.footer, false),
            };
          },
          { model, design, language },
        );
        const filename = `${item.type}.${design.id}.${language}.html`;
        await writeFile(
          output + "/" + filename,
          documentHtml(
            themed,
            design,
            language,
            item[language],
            rendered.subject,
            rendered.preheader,
          ),
        );
        versions[design.id - 1].files[language] = filename;
      }
    }
    catalog.push({ ...item, versions });
  }
} finally {
  await browser.close();
}
await writeFile(output + "/source-audit.json", JSON.stringify(sourceAudit, null, 2));
await writeFile(output + "/catalog.json", JSON.stringify(catalog, null, 2));
const template = await readFile("scripts/design/notification-email-gallery.html", "utf8");
await writeFile(
  output + "/index.html",
  template.replace("/* PREVIEW_CATALOG */ []", JSON.stringify(catalog)),
);
console.log(
  `Created ${types.length * designs.length * languages.length} bilingual email previews and gallery in ${output}. No email was sent.`,
);
