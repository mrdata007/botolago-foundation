import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

/**
 * Fantasy R4 — where a public gameweek recap lives: `/journee/<publicId>`.
 * Outside `/fantasy` on purpose, so a recipient reads it without any of the
 * Fantasy screens' session or availability gates.
 */
export const PUBLIC_RECAP_PREFIX = "/journee/";

export function publicRecapPath(publicId: string): string {
  return `${PUBLIC_RECAP_PREFIX}${publicId}`;
}

/**
 * The address to share. Arabic links carry `?lang=ar` so the page's
 * server-rendered title and preview are in the sender's language (the server
 * cannot see a reader's stored language).
 */
export function publicRecapUrl(publicId: string, lang: "fr" | "ar", origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location?.origin : undefined) ??
    PUBLIC_SITE_ORIGIN;
  return `${base}${publicRecapPath(publicId)}${lang === "ar" ? "?lang=ar" : ""}`;
}

/**
 * The few strings a public recap's server-rendered title and preview need, in
 * both languages. Kept here rather than read from `dictionary-ar.ts`, which
 * stays out of the page bundle; public-recap.test.ts holds them equal to the
 * dictionaries.
 */
export const PUBLIC_RECAP_META = {
  fr: {
    title: "Journée {n} · {points} · {alias} | BotolaGO",
    titleGeneric: "Un bilan Fantasy BotolaGO",
    description: "Le bilan d'une journée de Fantasy Botola Pro sur BotolaGO.",
    unitOne: "pt",
    unitOther: "pts",
  },
  ar: {
    title: "الجولة {n} · {points} · {alias} | BotolaGO",
    titleGeneric: "حصيلة فانتازي على BotolaGO",
    description: "حصيلة جولة في فانتازي البطولة الاحترافية على BotolaGO.",
    unitOne: "ن",
    unitOther: "ن",
  },
} as const;
