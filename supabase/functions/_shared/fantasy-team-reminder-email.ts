import {
  EMAIL_COLORS as C,
  escapeHtml as e,
  formatDay,
  formatTime,
} from "./notification-email-render.ts";
import { MOROCCO_TIME_ZONE, moroccoOffsetMs } from "./morocco-time.ts";

export type TeamReminderKind = "selection-open" | "deadline-reminder";

export interface TeamReminderEmailInput {
  kind: TeamReminderKind;
  language: "fr" | "ar";
  gameweek: number;
  managerName?: string | null;
  /** Trusted current selection state and confirmed deadline, re-read at send time. */
  selectionState: "open" | "locked" | "closed";
  deadlineConfirmed: boolean;
  opensAt: string;
  deadlineAt: string;
  now: string;
  timeZone?: string;
  appUrl: string;
  unsubscribeUrl: string;
}

function instant(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error("team_reminder_invalid_instant");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("team_reminder_invalid_instant");
  return date;
}

function clean(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.codePointAt(0)!;
      return code < 32 ||
        (code >= 127 && code <= 159) ||
        (code >= 0x2028 && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
        ? " "
        : character;
    })
    .join("")
    .trim()
    .slice(0, 80);
}

/** Rendering only: no recipient lookup, planner, database write or provider call. */
export function renderTeamReminderEmail(input: TeamReminderEmailInput): {
  subject: string;
  preheader: string;
  html: string;
  text: string;
} {
  if (input.kind !== "selection-open" && input.kind !== "deadline-reminder")
    throw new Error("team_reminder_invalid_kind");
  if (input.language !== "fr" && input.language !== "ar")
    throw new Error("team_reminder_invalid_language");
  if (!Number.isSafeInteger(input.gameweek) || input.gameweek < 1)
    throw new Error("team_reminder_invalid_gameweek");
  const opens = instant(input.opensAt);
  const deadline = instant(input.deadlineAt);
  const now = instant(input.now);
  if (
    input.selectionState !== "open" ||
    input.deadlineConfirmed !== true ||
    opens.getTime() > now.getTime() ||
    now.getTime() >= deadline.getTime() ||
    opens.getTime() >= deadline.getTime()
  )
    throw new Error("team_selection_not_open");
  if (input.kind === "deadline-reminder" && deadline.getTime() - now.getTime() > 86_400_000)
    throw new Error("team_reminder_too_early");
  const zone = input.timeZone ?? MOROCCO_TIME_ZONE;
  // Fail an unknown zone rather than silently showing the wrong deadline.
  const zoneFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    timeZoneName: "shortOffset",
  });
  const offset =
    zone === MOROCCO_TIME_ZONE
      ? `UTC${moroccoOffsetMs(deadline.getTime()) === 0 ? "+0" : "+1"}`
      : zoneFormatter.formatToParts(deadline).find((part) => part.type === "timeZoneName")!.value;
  const app = new URL(input.appUrl);
  if (
    app.protocol !== "https:" ||
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    app.pathname !== "/"
  )
    throw new Error("team_reminder_invalid_origin");
  const unsubscribe = new URL(input.unsubscribeUrl);
  if (
    unsubscribe.origin !== app.origin ||
    unsubscribe.username ||
    unsubscribe.password ||
    unsubscribe.pathname !== "/unsubscribe" ||
    !unsubscribe.searchParams.get("token")
  )
    throw new Error("team_reminder_invalid_unsubscribe");
  const ar = input.language === "ar";
  const dir = ar ? "rtl" : "ltr";
  const start = ar ? "right" : "left";
  const t = (fr: string, arabic: string) => (ar ? arabic : fr);
  const gw = t(`Journée ${input.gameweek}`, `الجولة ${input.gameweek}`);
  const opening = input.kind === "selection-open";
  const day = formatDay(deadline, input.language, zone);
  const time = formatTime(deadline, input.language, zone);
  const zoneLabel = `${zone === MOROCCO_TIME_ZONE ? t("Heure du Maroc", "توقيت المغرب") : zone} · ${offset}`;
  const copy = opening
    ? {
        subject: t(`${gw} : à toi de jouer, coach !`, `${gw}: حان دورك يا مدرب!`),
        preheader: t(
          "La sélection est ouverte. Prépare ton équipe avant la date limite.",
          "اختيار التشكيلة متاح. جهّز فريقك قبل الموعد النهائي.",
        ),
        eyebrow: t("UNE NOUVELLE JOURNÉE T’ATTEND", "جولة جديدة تنتظرك"),
        title: t("À toi de jouer, coach !", "حان دورك يا مدرب!"),
        body: t(
          "La sélection est ouverte ! Choisis ton onze, prépare ton banc et confie le brassard à ton capitaine. Ton prochain défi BotolaGO commence ici.",
          "اختيار التشكيلة متاح! اختر لاعبيك الأساسيين، ورتّب دكة البدلاء، وحدّد قائد فريقك. تحدّيك القادم على BotolaGO يبدأ من هنا.",
        ),
        cta: t("Choisir mon équipe", "اختر تشكيلتي"),
        closer: t("Une nouvelle journée. Tes choix. Ton équipe.", "جولة جديدة. اختياراتك. فريقك."),
      }
    : {
        subject: t(
          `${gw} : dernier appel pour ton équipe !`,
          `${gw}: لا تنسَ تشكيلتك قبل الإغلاق!`,
        ),
        preheader: t(
          "La date limite approche. Vérifie ton onze et ton capitaine avant le verrouillage.",
          "الموعد النهائي يقترب. راجع تشكيلتك وقائدك قبل إغلاق الاختيارات.",
        ),
        eyebrow: t("AVANT LE VERROUILLAGE", "قبل إغلاق الاختيارات"),
        title: t("Ton équipe est prête ?", "هل تشكيلتك جاهزة؟"),
        body: t(
          "Dernière vérification, coach ! Passe ton onze en revue, ajuste l’ordre de tes remplaçants et confirme ton capitaine. Après la date limite, les changements pour cette journée seront verrouillés.",
          "مراجعة أخيرة يا مدرب! راجع لاعبيك الأساسيين، واضبط ترتيب البدلاء، وتأكّد من اختيار قائدك. بعد الموعد النهائي، تُغلق التغييرات الخاصة بهذه الجولة.",
        ),
        cta: t("Vérifier mon équipe", "راجع تشكيلتي"),
        closer: t(
          "Le prochain coup d’envoi se prépare maintenant.",
          "الاستعداد لصافرة البداية يبدأ الآن.",
        ),
      };
  const name = clean(input.managerName ?? "");
  const greeting = name
    ? t(`Salut ${name},`, `مرحباً ${name}،`)
    : t("Salut coach,", "مرحباً يا مدرب،");
  const deadlineLabel = t("DATE LIMITE DE SÉLECTION", "الموعد النهائي لاختيار التشكيلة");
  const cta = `${app.origin}/fantasy/team`;
  const prefs = `${app.origin}/profile`;
  const iso = (value: string) =>
    `<span dir="ltr" style="unicode-bidi:isolate;display:inline-block;">${e(value)}</span>`;
  const table = (body: string, style = "") =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="border-collapse:collapse;${style}">${body}</table>`;
  const font = ar
    ? "'Segoe UI',Tahoma,Arial,sans-serif"
    : "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  const footer = t(
    "Tu reçois cet e-mail car tes rappels Fantasy et tes e-mails sont activés sur BotolaGO.",
    "تصلك هذه الرسالة لأن تذكيرات الفانتازي والبريد الإلكتروني مفعّلة في حسابك على BotolaGO.",
  );
  const html = `<!doctype html>
<html lang="${input.language}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${e(copy.subject)}</title><style>@media(max-width:620px){.outer{padding:12px 8px!important}.content{padding:24px 20px!important}h1{font-size:28px!important}}</style></head>
<body dir="${dir}" style="margin:0;background:${C.page};font-family:${font};color:${C.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(copy.preheader)}</div>
${table(`<tr><td class="outer" align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
${table(
  `<tr><td bgcolor="${C.ink}" style="padding:26px 28px;background:${C.ink};border-radius:16px 16px 0 0;text-align:${start};"><a href="${app.origin}" style="text-decoration:none;"><img src="${app.origin}/email/botolago-wordmark-light.png" alt="BotolaGO" width="196" height="35" style="display:inline-block;border:0;width:196px;height:35px;max-width:100%;"></a></td></tr>
<tr><td class="content" bgcolor="#ffffff" style="padding:30px 28px 32px;background:#ffffff;border-radius:0 0 16px 16px;text-align:${start};">
<p style="margin:0 0 12px;color:${C.ink};font-size:12px;font-weight:700;line-height:1.6;">${e(copy.eyebrow)}</p>
<h1 style="margin:0;font-size:34px;line-height:1.25;color:${C.ink};">${e(copy.title)}</h1>
<p style="margin:22px 0 10px;font-size:16px;line-height:1.7;">${e(greeting)}</p>
<p style="margin:0;font-size:16px;line-height:1.7;">${e(copy.body)}</p>
${table(`<tr><td bgcolor="${C.ink}" style="padding:26px 18px;border-radius:12px;text-align:center;background:${C.ink};color:${C.onInk};"><p style="margin:0 0 12px;font-size:14px;color:#ffffff;">${e(gw)}</p><p style="margin:0 0 10px;font-size:12px;font-weight:700;line-height:1.7;color:#ffffff;">${e(deadlineLabel)}</p><p style="margin:0 0 8px;font-size:17px;line-height:1.7;color:#ffffff;">${e(day)}</p><div style="font-size:54px;font-weight:800;line-height:1.2;">${iso(time)}</div><p dir="ltr" style="margin:12px 0 0;font-size:12px;color:#ffffff;line-height:1.7;overflow-wrap:anywhere;">${e(zoneLabel)}</p></td></tr>`, "margin:24px 0;")}
${table(`<tr><td bgcolor="${C.ink}" align="center" style="border-radius:9px;background:${C.ink};"><a href="${cta}" style="display:block;padding:16px 20px;color:#ffffff;font-weight:700;font-size:16px;line-height:24px;text-decoration:none;">${e(copy.cta)}</a></td></tr>`)}
<p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:${C.muted};">${e(copy.closer)}</p>
</td></tr>`,
  "max-width:600px;margin:0 auto;",
)}
${table(`<tr><td style="padding:22px 12px;text-align:${start};font-size:12px;line-height:1.8;color:${C.muted};"><p style="margin:0;">${e(footer)}</p><p style="margin:10px 0 0;"><a href="${prefs}" style="color:${C.ink};">${e(t("Gérer mes notifications", "إدارة إشعاراتي"))}</a> · <a href="${e(unsubscribe.href)}" style="color:${C.ink};">${e(t("Me désabonner", "إلغاء الاشتراك"))}</a></p><p dir="ltr" style="margin:10px 0 0;">© BotolaGO · botolago.com</p></td></tr>`, "max-width:600px;margin:0 auto;")}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>`)}</body></html>`;
  const text = [
    greeting,
    copy.title,
    copy.body,
    gw,
    `${deadlineLabel} : ${day} ${time} (${zoneLabel})`,
    `${copy.cta} : ${cta}`,
    copy.closer,
    footer,
    `${t("Gérer mes notifications", "إدارة إشعاراتي")} : ${prefs}`,
    `${t("Me désabonner", "إلغاء الاشتراك")} : ${unsubscribe.href}`,
    "© BotolaGO · botolago.com",
  ].join("\n\n");
  return { subject: copy.subject, preheader: copy.preheader, html, text };
}
