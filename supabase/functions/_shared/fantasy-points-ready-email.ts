import { EMAIL_COLORS as C, escapeHtml as e } from "./notification-email-brand.ts";
import { renderClubEmail } from "./notification-email-club.ts";

export const POINTS_READY_VARIANTS = ["score-reveal", "manager-report", "full-time"] as const;
export type PointsReadyVariant = (typeof POINTS_READY_VARIANTS)[number];
/** Selected by the owner on 2026-10-19. Other directions remain archived previews. */
export const APPROVED_POINTS_READY_VARIANT: PointsReadyVariant = "score-reveal";

export interface PointsReadyEmailInput {
  language: "fr" | "ar";
  variant: PointsReadyVariant;
  /** Trusted result state, never inferred from a completed fixture or a non-null total. */
  state: "finalized" | "provisional";
  pendingPlayers: number;
  gameweek: number;
  points: number;
  totalPoints?: number | null;
  overallRank?: number | null;
  managerName?: string | null;
  appUrl: string;
  /** A delivery-specific URL produced by the existing unsubscribe-token system. */
  unsubscribeUrl: string;
}

function origin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("points_ready_invalid_origin");
  }
  return url.origin;
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

/** Pure rendering only. No planner, recipient lookup or provider call. */
export function renderPointsReadyEmail(input: PointsReadyEmailInput): {
  subject: string;
  preheader: string;
  html: string;
  text: string;
} {
  if (input.state !== "finalized" || input.pendingPlayers !== 0)
    throw new Error("points_not_ready");
  if (
    !Number.isSafeInteger(input.points) ||
    !Number.isSafeInteger(input.gameweek) ||
    input.gameweek < 1
  ) {
    throw new Error("points_ready_invalid_score");
  }
  if (!POINTS_READY_VARIANTS.includes(input.variant))
    throw new Error("points_ready_invalid_variant");
  if (input.language !== "fr" && input.language !== "ar")
    throw new Error("points_ready_invalid_language");
  const app = origin(input.appUrl);
  const unsubscribe = new URL(input.unsubscribeUrl);
  if (
    unsubscribe.origin !== app ||
    unsubscribe.pathname !== "/unsubscribe" ||
    !unsubscribe.searchParams.get("token")
  ) {
    throw new Error("points_ready_invalid_unsubscribe");
  }
  const ar = input.language === "ar";
  const dir = ar ? "rtl" : "ltr";
  const start = ar ? "right" : "left";
  const number = (n: number) => new Intl.NumberFormat(ar ? "ar-MA-u-nu-latn" : "fr-FR").format(n);
  const t = (fr: string, arabic: string) => (ar ? arabic : fr);
  const gw = t(`Journée ${number(input.gameweek)}`, `الجولة ${number(input.gameweek)}`);
  const points = number(input.points);
  const pointUnit = Math.abs(input.points) === 1 ? "point" : "points";
  const pointsLabel = t(pointUnit.toUpperCase(), "النقاط");
  const idx = POINTS_READY_VARIANTS.indexOf(input.variant);
  const copy = [
    {
      subject: t(
        `${gw} : votre score est prêt (${points} ${pointUnit})`,
        `${gw}: نقاطك جاهزة (${points})`,
      ),
      preheader: t(
        "Consultez les points de vos joueurs et le classement de votre équipe.",
        "اطّلع على نقاط لاعبيك وترتيب فريقك.",
      ),
      eyebrow: t("LE SCORE EST LÀ", "النقاط جاهزة"),
      title: t("Vos points sont prêts !", "نقاطك جاهزة!"),
      body: t(
        "Les points de cette journée sont publiés. Découvrez le détail par joueur et retrouvez votre équipe au classement.",
        "نُشرت نقاط هذه الجولة. اطّلع على تفاصيل نقاط كل لاعب وترتيب فريقك.",
      ),
      cta: t("Voir mes points", "عرض نقاطي"),
      closer: t("Rendez-vous à la prochaine journée !", "نلتقي في الجولة المقبلة!"),
    },
    {
      subject: t(`Votre bilan de la ${gw.toLowerCase()} est prêt`, `ملخص ${gw} جاهز!`),
      preheader: t(
        `${points} ${pointUnit} : retrouvez le détail de votre journée.`,
        `نقاط الجولة: ${points}. اطّلع على التفاصيل.`,
      ),
      eyebrow: t("BILAN DE LA JOURNÉE", "ملخص الجولة"),
      title: t("Votre journée en détail", "تفاصيل جولتك"),
      body: t(
        "Consultez les points de chaque joueur pour faire le bilan et préparer vos prochains choix.",
        "راجع نقاط كل لاعب لتقييم جولتك والاستعداد لاختياراتك المقبلة.",
      ),
      cta: t("Voir le détail de mes points", "عرض تفاصيل نقاطي"),
      closer: t("Rendez-vous à la prochaine journée !", "نلتقي في الجولة المقبلة!"),
    },
    {
      subject: t(
        `Coup de sifflet final : ${points} ${pointUnit} pour la ${gw.toLowerCase()} !`,
        `صافرة النهاية! نقاطك في ${gw}: ${points}`,
      ),
      preheader: t(
        "Les points de votre équipe sont publiés sur BotolaGO.",
        "نُشرت نقاط فريقك على BotolaGO.",
      ),
      eyebrow: t("FIN DU MATCH. PLACE AUX POINTS.", "انتهت المباريات. حان وقت النقاط."),
      title: t("Coup de sifflet final !", "صافرة النهاية!"),
      body: t(
        "La journée est terminée. Retrouvez les points de vos joueurs et la place de votre équipe au classement.",
        "انتهت الجولة. اطّلع على نقاط لاعبيك وترتيب فريقك.",
      ),
      cta: t("Voir les points de mon équipe", "عرض نقاط فريقي"),
      closer: t("Rendez-vous à la prochaine journée !", "نلتقي في الجولة المقبلة!"),
    },
  ][idx]!;
  const name = clean(input.managerName ?? "");
  const greeting = name ? t(`Bonjour ${name},`, `مرحبًا ${name}،`) : t("Bonjour,", "مرحبًا،");
  const facts: [string, string][] = [];
  if (Number.isSafeInteger(input.totalPoints))
    facts.push([t("Total de la saison", "مجموع الموسم"), number(input.totalPoints!)]);
  if (Number.isSafeInteger(input.overallRank) && input.overallRank! > 0)
    facts.push([t("Classement général", "الترتيب العام"), `#${number(input.overallRank!)}`]);
  const table = (body: string, style = "") =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="width:100%;border-collapse:separate;border-spacing:0;${style}">${body}</table>`;
  const num = (v: string) =>
    `<span dir="ltr" style="unicode-bidi:isolate;display:inline-block;">${e(v)}</span>`;
  const score = `<div style="font-size:64px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;">${num(points)}</div><div style="font-size:13px;line-height:24px;font-weight:700;">${e(pointsLabel)}</div>`;
  const factsHtml = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:14px 0;border-bottom:1px solid ${C.rule};text-align:${start};color:${C.muted};font-size:14px;">${e(label)}</td><td style="padding:14px 0;border-bottom:1px solid ${C.rule};text-align:${ar ? "left" : "right"};font-size:20px;font-weight:700;color:${C.ink};">${num(value)}</td></tr>`,
    )
    .join("");
  const hero =
    idx === 2
      ? table(
          `<tr><td width="45%" bgcolor="${C.onInk}" style="padding:24px 16px;background:${C.onInk};color:${C.ink};text-align:${start};border-radius:${ar ? "0 12px 12px 0" : "12px 0 0 12px"};"><p style="margin:0 0 12px;font-size:12px;font-weight:800;">${e(t("SCORE FINAL", "الرصيد النهائي"))}</p><p style="margin:0;font-size:22px;font-weight:800;line-height:1.4;">${e(gw)}</p></td><td width="55%" bgcolor="${C.ink}" style="padding:24px 12px;background:${C.ink};color:#ffffff;text-align:center;border-radius:${ar ? "12px 0 0 12px" : "0 12px 12px 0"};">${score}</td></tr>`,
          "margin:22px 0 0;table-layout:fixed;",
        )
      : idx === 1
        ? table(
            `<tr><td style="padding:24px;border:1px solid ${C.rule};border-top:4px solid ${C.accent};border-radius:12px;text-align:${start};color:${C.ink};"><p style="margin:0 0 12px;font-size:14px;">${e(gw)}</p>${score}</td></tr>`,
            "margin:22px 0 0;table-layout:fixed;",
          )
        : table(
            `<tr><td bgcolor="${C.onInk}" style="padding:28px 20px;border:1px solid ${C.rule};border-radius:12px;text-align:center;background-color:${C.onInk};color:${C.ink};"><p style="margin:0 0 10px;font-size:14px;">${e(idx === 2 ? t("SCORE FINAL", "الرصيد النهائي") : gw)}</p>${score}${idx === 2 ? `<p style="margin:14px 0 0;font-size:14px;color:#ffffff;">${e(gw)}</p>` : ""}</td></tr>`,
            "margin:22px 0 0;table-layout:fixed;",
          );
  const footer = t(
    "Vous recevez cet e-mail car vos rappels Fantasy et vos e-mails sont activés sur BotolaGO.",
    "تصلك هذه الرسالة لأن تذكيرات الفانتازي والبريد الإلكتروني مفعّلة في حسابك على BotolaGO.",
  );
  const cta = `${app}/fantasy/points`;
  const html = renderClubEmail({
    language: input.language,
    appUrl: app,
    subject: copy.subject,
    preheader: copy.preheader,
    kicker: copy.eyebrow,
    title: copy.title,
    bodyHtml: `<p style="margin:18px 0 0;">${e(greeting)}</p><p style="margin:18px 0 0;">${e(copy.body)}</p>${hero}${facts.length ? table(factsHtml, "margin:22px 0 0;table-layout:fixed;") : ""}`,
    cta: { label: copy.cta, url: cta },
    closingHtml: `<p style="margin:18px 0 0;font-size:14px;color:${C.muted};">${e(copy.closer)}</p><p style="margin:18px 0 0;font-size:12px;color:${C.muted};">${e(t("Points calculés à partir des notes SofaScore reçues.", "حُسبت النقاط انطلاقاً من تقييمات SofaScore المستلمة."))}</p>`,
    footerHtml: `<p style="margin:0;">${e(footer)}</p><p style="margin:10px 0 0;"><a href="${app}/profile" style="color:${C.ink};display:inline-block;padding:5px 0;">${e(t("Gérer mes notifications", "إدارة إشعاراتي"))}</a> · <a href="${e(unsubscribe.href)}" style="color:${C.ink};display:inline-block;padding:5px 0;">${e(t("Me désabonner", "إلغاء الاشتراك"))}</a></p><p style="margin:10px 0 0;" dir="ltr">© BotolaGO · botolago.com</p>`,
  });
  const text = [
    greeting,
    copy.title,
    copy.body,
    t(`${gw} : ${points} ${pointUnit}`, `${gw} · مجموع النقاط: ${points}`),
    ...facts.map(([label, value]) => `${label} : ${value}`),
    `${copy.cta} : ${cta}`,
    copy.closer,
    t(
      "Points calculés à partir des notes SofaScore reçues.",
      "حُسبت النقاط انطلاقاً من تقييمات SofaScore المستلمة.",
    ),
    footer,
    `${t("Gérer mes notifications", "إدارة إشعاراتي")} : ${app}/profile`,
    `${t("Me désabonner", "إلغاء الاشتراك")} : ${unsubscribe.href}`,
  ].join("\n\n");
  return { subject: copy.subject, preheader: copy.preheader, html, text };
}
