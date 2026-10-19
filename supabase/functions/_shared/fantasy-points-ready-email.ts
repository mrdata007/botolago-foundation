import { EMAIL_COLORS as C, escapeHtml as e } from "./notification-email-render";

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
  const font = ar
    ? "'Segoe UI',Tahoma,Arial,sans-serif"
    : "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  const number = (n: number) => new Intl.NumberFormat(ar ? "ar-MA-u-nu-latn" : "fr-FR").format(n);
  const t = (fr: string, arabic: string) => (ar ? arabic : fr);
  const gw = t(`Journée ${number(input.gameweek)}`, `الجولة ${number(input.gameweek)}`);
  const points = number(input.points);
  const pointsLabel = t("POINTS", "نقطة");
  const idx = POINTS_READY_VARIANTS.indexOf(input.variant);
  const copy = [
    {
      subject: t(
        `${gw} : tes ${points} points sont prêts !`,
        `${gw}: نقاطك جاهزة — ${points} نقطة!`,
      ),
      preheader: t(
        "Le moment de découvrir le score de ton équipe est arrivé. À toi de jouer, coach !",
        "حان وقت اكتشاف رصيد فريقك. افتح الملخص يا مدرب!",
      ),
      eyebrow: t("LE SCORE EST LÀ", "النقاط جاهزة"),
      title: t("C’est prêt, coach !", "نقاطك جاهزة يا مدرب!"),
      body: t(
        "Ta journée Fantasy a livré son verdict. Découvre tes points et les notes de chaque joueur, puis retrouve ton équipe au classement.",
        "اكتملت نقاط جولتك في الفانتازي. اكتشف رصيدك وتقييم كل لاعب، ثم اطّلع على ترتيب فريقك.",
      ),
      cta: t("Découvrir mes points", "اكتشف نقاطي"),
      closer: t("La Botola se vit. La Fantasy aussi.", "عِش أجواء البطولة… والفانتازي أيضاً."),
    },
    {
      subject: t(
        `Coach, ton débrief de la ${gw.toLowerCase()} est prêt`,
        `يا مدرب، ملخص ${gw} جاهز!`,
      ),
      preheader: t(
        `${points} points : ton équipe, tes notes, ton classement. Tout est dans le débrief.`,
        `${points} نقطة: فريقك وتقييمات لاعبيك وترتيبك، في ملخص واحد.`,
      ),
      eyebrow: t("LE DÉBRIEF DU COACH", "ملخص المدرب"),
      title: t("À toi le débrief !", "ملخص الجولة بين يديك!"),
      body: t(
        "Les points sont prêts. Passe ton effectif en revue, regarde la contribution de chacun et prépare la suite de ta saison.",
        "نقاطك جاهزة. راجع أداء تشكيلتك، واكتشف مساهمة كل لاعب، واستعد لما تبقى من الموسم.",
      ),
      cta: t("Ouvrir mon débrief", "افتح ملخصي"),
      closer: t(
        "Chaque choix compte. Chaque journée aussi.",
        "كل اختيار يصنع الفارق. وكل جولة فرصة جديدة.",
      ),
    },
    {
      subject: t(
        `Coup de sifflet final : ${points} points pour la ${gw.toLowerCase()} !`,
        `صافرة النهاية! ${points} نقطة في ${gw}`,
      ),
      preheader: t(
        "Le terrain a parlé. Retrouve maintenant le score de ton équipe sur BotolaGO.",
        "قال الملعب كلمته. اكتشف الآن رصيد فريقك على BotolaGO.",
      ),
      eyebrow: t("FIN DU MATCH. PLACE AUX POINTS.", "انتهت المباريات. حان وقت النقاط."),
      title: t("Coup de sifflet final !", "صافرة النهاية!"),
      body: t(
        "La journée est terminée et tes points sont prêts ! Retrouve les notes de tes joueurs et le classement pour prolonger les émotions du week-end.",
        "انتهت الجولة ونقاطك جاهزة! اكتشف تقييمات لاعبيك والترتيب، واستمتع بأجواء البطولة حتى بعد صافرة النهاية.",
      ),
      cta: t("Voir le score de mon équipe", "شاهد رصيد فريقي"),
      closer: t("Le match continue sur BotolaGO.", "الحماس مستمر على BotolaGO."),
    },
  ][idx]!;
  const name = clean(input.managerName ?? "");
  const greeting = name
    ? t(`Salut ${name},`, `مرحباً ${name}،`)
    : t("Salut coach,", "مرحباً يا مدرب،");
  const facts: [string, string][] = [];
  if (Number.isSafeInteger(input.totalPoints))
    facts.push([t("Total de la saison", "مجموع الموسم"), number(input.totalPoints!)]);
  if (Number.isSafeInteger(input.overallRank) && input.overallRank! > 0)
    facts.push([t("Classement général", "الترتيب العام"), `#${number(input.overallRank!)}`]);
  const table = (body: string, style = "") =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="border-collapse:collapse;${style}">${body}</table>`;
  const num = (v: string) =>
    `<span dir="ltr" style="unicode-bidi:isolate;display:inline-block;">${e(v)}</span>`;
  const score = `<div style="font-size:${idx === 2 ? 80 : 72}px;font-weight:800;line-height:1.1;">${num(points)}</div><div style="font-size:13px;line-height:24px;font-weight:700;">${e(pointsLabel)}</div>`;
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
          "margin:24px 0;",
        )
      : idx === 1
        ? table(
            `<tr><td style="padding:24px;border:1px solid ${C.rule};border-top:4px solid ${C.accent};border-radius:12px;text-align:${start};color:${C.ink};"><p style="margin:0 0 12px;font-size:14px;">${e(gw)}</p>${score}</td></tr>`,
            "margin:24px 0;",
          )
        : table(
            `<tr><td bgcolor="${C.ink}" style="padding:28px 20px;border-radius:12px;text-align:center;background:${C.ink};color:${C.onInk};"><p style="margin:0 0 14px;font-size:14px;color:#ffffff;">${e(idx === 2 ? t("SCORE FINAL", "الرصيد النهائي") : gw)}</p>${score}${idx === 2 ? `<p style="margin:14px 0 0;font-size:14px;color:#ffffff;">${e(gw)}</p>` : ""}</td></tr>`,
            "margin:24px 0;",
          );
  const logo = `${app}/email/botolago-wordmark-${idx === 1 ? "color" : "light"}.png`;
  const header = `<tr><td bgcolor="${idx === 1 ? C.surface : C.ink}" style="padding:26px 28px;background-color:${idx === 1 ? C.surface : C.ink};border-bottom:1px solid ${idx === 1 ? C.rule : C.ink};border-radius:16px 16px 0 0;text-align:${start};"><a href="${app}" style="text-decoration:none;"><img src="${logo}" alt="BotolaGO" width="196" height="35" style="display:inline-block;border:0;width:196px;height:35px;max-width:100%;" /></a></td></tr>`;
  const footer = t(
    "Tu reçois cet e-mail car tes rappels Fantasy et tes e-mails sont activés sur BotolaGO.",
    "تصلك هذه الرسالة لأن تذكيرات الفانتازي والبريد الإلكتروني مفعّلة في حسابك على BotolaGO.",
  );
  const cta = `${app}/fantasy/points`;
  const html = `<!doctype html>
<html lang="${input.language}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${e(copy.subject)}</title><style>@media(max-width:620px){.outer{padding:12px 8px!important}.content{padding:24px 20px!important}h1{font-size:28px!important}}</style></head>
<body dir="${dir}" style="margin:0;background:${C.page};font-family:${font};color:${C.text};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(copy.preheader)}</div>
${table(`<tr><td class="outer" align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
${table(
  `${header}<tr><td class="content" bgcolor="#ffffff" style="padding:30px 28px 32px;background:#ffffff;border-radius:0 0 16px 16px;text-align:${start};">
<p style="margin:0 0 12px;color:${C.ink};font-size:12px;font-weight:700;line-height:1.6;">${e(copy.eyebrow)}</p>
<h1 style="margin:0;font-size:34px;line-height:1.25;color:${C.ink};">${e(copy.title)}</h1>
<p style="margin:22px 0 10px;font-size:16px;line-height:1.7;">${e(greeting)}</p>
<p style="margin:0;font-size:16px;line-height:1.7;">${e(copy.body)}</p>
${hero}${facts.length ? table(factsHtml, "margin-bottom:24px;") : ""}
${table(`<tr><td bgcolor="${C.ink}" align="center" style="border-radius:9px;background:${C.ink};"><a href="${cta}" style="display:block;padding:16px 20px;color:#ffffff;font-weight:700;font-size:16px;line-height:24px;text-decoration:none;">${e(copy.cta)}</a></td></tr>`)}
<p style="margin:22px 0 0;font-size:14px;line-height:1.7;color:${C.muted};">${e(copy.closer)}</p>
<p style="margin:10px 0 0;font-size:12px;line-height:1.7;color:${C.muted};">${e(t("Points calculés à partir des notes SofaScore reçues.", "حُسبت النقاط انطلاقاً من تقييمات SofaScore المستلمة."))}</p>
</td></tr>`,
  "max-width:600px;margin:0 auto;",
)}
${table(`<tr><td style="padding:22px 12px;text-align:${start};font-size:12px;line-height:1.8;color:${C.muted};"><p style="margin:0;">${e(footer)}</p><p style="margin:10px 0 0;"><a href="${app}/profile" style="color:${C.ink};">${e(t("Gérer mes notifications", "إدارة إشعاراتي"))}</a> · <a href="${e(unsubscribe.href)}" style="color:${C.ink};">${e(t("Me désabonner", "إلغاء الاشتراك"))}</a></p><p style="margin:10px 0 0;" dir="ltr">© BotolaGO · botolago.com</p></td></tr>`, "max-width:600px;margin:0 auto;")}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>`)}</body></html>`;
  const text = [
    greeting,
    copy.title,
    copy.body,
    `${gw} : ${points} ${t("points", "نقطة")}`,
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
