import {
  EMAIL_COLORS as C,
  escapeHtml as e,
  formatDay,
  formatTime,
} from "./notification-email-render.ts";
import { renderClubEmail } from "./notification-email-club.ts";
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
        subject: t(`${gw} : préparez votre équipe`, `${gw}: جهّز فريقك`),
        preheader: t(
          "Vous pouvez modifier votre équipe jusqu’à la date limite indiquée.",
          "يمكنك تعديل فريقك حتى الموعد النهائي الموضّح أدناه.",
        ),
        eyebrow: t("NOUVELLE JOURNÉE", "جولة جديدة"),
        title: t("À vous de jouer !", "حان دورك!"),
        body: t(
          "Choisissez vos 11 titulaires, classez vos remplaçants et désignez votre capitaine avant la date limite.",
          "اختر لاعبيك الأساسيين، ورتّب البدلاء، وحدّد قائدك قبل الموعد النهائي.",
        ),
        cta: t("Choisir mon équipe", "اختيار تشكيلتي"),
        closer: t("Bonne journée de Fantasy !", "بالتوفيق في الجولة!"),
      }
    : {
        subject: t(
          `${gw} : vérifiez votre équipe avant la date limite`,
          `${gw}: راجع فريقك قبل الموعد النهائي`,
        ),
        preheader: t(
          "Vérifiez vos titulaires, vos remplaçants et votre capitaine.",
          "راجع لاعبيك الأساسيين وترتيب البدلاء وقائدك.",
        ),
        eyebrow: t("AVANT LA DATE LIMITE", "قبل الموعد النهائي"),
        title: t("Votre équipe est prête ?", "هل فريقك جاهز؟"),
        body: t(
          "Vous pouvez encore modifier votre équipe. Après la date limite ci-dessous, les changements pour cette journée ne seront plus possibles.",
          "ما زال بإمكانك تعديل فريقك. بعد الموعد النهائي أدناه، لن تتمكن من تغييره لهذه الجولة.",
        ),
        cta: t("Vérifier mon équipe", "مراجعة تشكيلتي"),
        closer: t("Bonne journée de Fantasy !", "بالتوفيق في الجولة!"),
      };
  const name = clean(input.managerName ?? "");
  const greeting = name ? t(`Bonjour ${name},`, `مرحبًا ${name}،`) : t("Bonjour,", "مرحبًا،");
  const deadlineLabel = t("DATE LIMITE DE SÉLECTION", "الموعد النهائي لاختيار التشكيلة");
  const cta = `${app.origin}/fantasy/team`;
  const prefs = `${app.origin}/profile`;
  const iso = (value: string) =>
    `<span dir="ltr" style="unicode-bidi:isolate;display:inline-block;">${e(value)}</span>`;
  const table = (body: string, style = "") =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="width:100%;border-collapse:separate;border-spacing:0;${style}">${body}</table>`;
  const footer = t(
    "Vous recevez cet e-mail car vos rappels Fantasy et vos e-mails sont activés sur BotolaGO.",
    "تصلك هذه الرسالة لأن تذكيرات الفانتازي والبريد الإلكتروني مفعّلة في حسابك على BotolaGO.",
  );
  const html = renderClubEmail({
    language: input.language,
    appUrl: app.origin,
    subject: copy.subject,
    preheader: copy.preheader,
    kicker: copy.eyebrow,
    title: copy.title,
    bodyHtml: `<p style="margin:18px 0 0;">${e(greeting)}</p>
<p style="margin:18px 0 0;">${e(copy.body)}</p>
${table(`<tr><td bgcolor="${C.onInk}" style="padding:26px 18px;border:1px solid ${C.rule};border-radius:12px;text-align:center;background-color:${C.onInk};color:${C.ink};"><p style="margin:0 0 10px;font-size:14px;">${e(gw)}</p><p style="margin:0 0 10px;font-size:12px;font-weight:700;line-height:1.7;">${e(deadlineLabel)}</p><p style="margin:0 0 10px;font-size:17px;line-height:1.7;">${e(day)}</p><div style="font-size:64px;font-weight:800;line-height:1.2;font-variant-numeric:tabular-nums;">${iso(time)}</div><p dir="ltr" style="margin:12px 0 0;font-size:12px;line-height:1.7;overflow-wrap:anywhere;">${e(zoneLabel)}</p></td></tr>`, "margin:22px 0 0;table-layout:fixed;")}`,
    cta: { label: copy.cta, url: cta },
    closingHtml: `<p style="margin:18px 0 0;font-size:14px;color:${C.muted};">${e(copy.closer)}</p>`,
    footerHtml: `<p style="margin:0;">${e(footer)}</p><p style="margin:10px 0 0;"><a href="${prefs}" style="color:${C.ink};display:inline-block;padding:5px 0;">${e(t("Gérer mes notifications", "إدارة إشعاراتي"))}</a> · <a href="${e(unsubscribe.href)}" style="color:${C.ink};display:inline-block;padding:5px 0;">${e(t("Me désabonner", "إلغاء الاشتراك"))}</a></p><p dir="ltr" style="margin:10px 0 0;">© BotolaGO · botolago.com</p>`,
  });
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
