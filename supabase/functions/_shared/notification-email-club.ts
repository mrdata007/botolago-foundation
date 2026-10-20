import { EMAIL_COLORS as C, escapeHtml as e } from "./notification-email-brand.ts";
import type { EmailLanguage } from "./notification-email-types.ts";

interface ClubEmailContent {
  language: EmailLanguage;
  /** Validated application origin, never recipient data. */
  appUrl: string;
  subject: string;
  preheader: string;
  kicker: string;
  title: string;
  dateline?: string;
  /** Escaped fragments produced by the pure content renderers. */
  bodyHtml: string;
  cta: { label: string; url: string };
  closingHtml?: string;
  footerHtml: string;
}

/** Selected Club design. No DOM, network, provider, or runtime dependencies. */
export function renderClubEmail(content: ClubEmailContent): string {
  const ar = content.language === "ar";
  const dir = ar ? "rtl" : "ltr";
  const start = ar ? "right" : "left";
  const font = ar ? "'Segoe UI',Tahoma,Arial,sans-serif" : "Arial,Helvetica,sans-serif";
  const title = ar ? content.title : content.title.replace(/ ([!?;:])/g, "\u202f$1");
  const table = (body: string, style = "", extra = "") =>
    `<table role="presentation" dir="${dir}" width="100%" cellpadding="0" cellspacing="0" border="0"${extra} style="width:100%;border-collapse:separate;border-spacing:0;${style}">${body}</table>`;
  const action = table(
    `<tr><td align="center" style="padding:28px 0 0;">${table(`<tr><td align="center" bgcolor="${C.onInk}" style="background-color:${C.onInk};background-image:linear-gradient(to bottom,#60fa97,${C.onInk});border-radius:28px;"><a data-email-cta href="${e(content.cta.url)}" target="_blank" rel="noopener" style="display:block;padding:16px 20px;min-height:24px;line-height:24px;font-family:${font};font-size:16px;font-weight:700;text-decoration:none;color:${C.ink};border-radius:28px;overflow-wrap:break-word;">${e(content.cta.label)}</a></td></tr>`)}</td></tr>`,
  );
  // #60fa97 is the sRGB equivalent of --ui-accent-spring. Outlook falls back
  // to bgcolor cyan; both fills retain navy text with strong contrast.
  return `<!DOCTYPE html>
<html lang="${content.language}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${e(content.subject)}</title><style>body{margin:0;padding:0}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}img{border:0}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media only screen and (max-width:620px){.bg-outer{padding:16px 8px!important}.bg-card{padding:24px 20px!important}.email-title{font-size:28px!important}.email-footer{padding:22px 16px!important}}</style></head>
<body dir="${dir}" bgcolor="${C.page}" style="margin:0;padding:0;width:100%;background-color:${C.page};font-family:${font};color:${C.text};"><div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${e(content.preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>
${table(
  `<tr><td class="bg-outer" align="center" style="padding:36px 16px;">
<!--[if mso]><table role="presentation" dir="${dir}" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
${table(
  `<tr><td bgcolor="${C.ink}" style="background-color:${C.ink};border-radius:14px 14px 0 0;">${table(`<tr><td align="${start}" style="padding:24px;text-align:${start};"><a href="${e(content.appUrl)}" style="text-decoration:none;color:#ffffff;"><img src="${e(content.appUrl)}/email/botolago-wordmark-light.png" width="168" height="30" alt="BotolaGO" style="display:inline-block;border:0;width:168px;max-width:100%;height:auto;vertical-align:middle;"></a></td></tr>`)}</td></tr>
<tr><td class="bg-card" dir="${dir}" align="${start}" bgcolor="${C.surface}" style="background-color:${C.surface};padding:32px;border-radius:0 0 14px 14px;font-family:${font};font-size:16px;line-height:${ar ? "1.95" : "1.7"};color:${C.text};text-align:${start};">
<p style="margin:0 0 12px;font-size:12px;line-height:1.7;font-weight:700;color:${C.ink};">${e(content.kicker)}</p>
<h1 class="email-title" style="margin:0;font-family:${font};font-size:30px;line-height:${ar ? "1.55" : "1.25"};font-weight:800;color:${C.text};overflow-wrap:break-word;">${e(title)}</h1>
${content.dateline ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.8;color:${C.muted};">${e(content.dateline)}</p>` : ""}
${content.bodyHtml}${action}${content.closingHtml ?? ""}
</td></tr>`,
  "max-width:600px;margin:0 auto;table-layout:fixed;",
)}
${table(`<tr><td class="email-footer" align="${start}" style="padding:24px 20px;font-family:${font};font-size:12px;line-height:1.8;color:${C.muted};text-align:${start};">${content.footerHtml}</td></tr>`, "max-width:600px;margin:0 auto;table-layout:fixed;")}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>`,
  `background-color:${C.page};`,
  ` bgcolor="${C.page}"`,
)}
</body></html>`;
}
