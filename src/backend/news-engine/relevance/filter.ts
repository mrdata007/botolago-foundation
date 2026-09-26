// Relevance filtering.
//
// BotolaGO is not a general football aggregator. This stage runs before any
// paid model call, so an irrelevant article costs one cheap keyword pass and
// nothing else.
//
// It is deliberately a transparent rule set rather than a classifier: an
// editor must be able to read why a story was dropped, and every rejection is
// stored with its reason so the rules improve from evidence.

import type { NewsSourceLanguage, RelevanceDecision } from "../contracts";
import { normalizeEntityName } from "../normalization/text";

interface SignalGroup {
  readonly name: string;
  readonly weight: number;
  readonly terms: readonly string[];
}

/** Subjects BotolaGO covers. Arabic first: it is the source language. */
const PRIMARY_SIGNALS: readonly SignalGroup[] = [
  {
    name: "botola",
    weight: 0.55,
    terms: [
      "البطولة الاحترافية",
      "البطولة الوطنية",
      "البطولة المغربية",
      "القسم الاول",
      "botola pro",
      "botola",
      "championnat marocain",
    ],
  },
  {
    name: "moroccan_club",
    weight: 0.55,
    terms: [
      "الوداد",
      "الرجاء",
      "الجيش الملكي",
      "نهضة بركان",
      "المغرب الفاسي",
      "الفتح الرباطي",
      "الدفاع الحسني",
      "الدفاع الجديدي",
      "حسنية اكادير",
      "اولمبيك اسفي",
      "اتحاد طنجة",
      "المغرب التطواني",
      "شباب المحمدية",
      "الكوكب المراكشي",
      "اتحاد تواركة",
      "نهضة الزمامرة",
      "الجمعية السوالمية",
      "شباب السوالم",
      "وداد تمارة",
      "اولمبيك الدشيرة",
      "امل تيزنيت",
      "يعقوب المنصور",
      "wydad",
      "raja",
      "asfar",
      "as far",
      "berkane",
      "maghreb de fes",
      "fus rabat",
      "difaa",
      "hassania",
      "olympic safi",
      "ittihad tanger",
      "moghreb tetouan",
      "kawkab",
      "codm",
    ],
  },
  {
    name: "national_team",
    weight: 0.5,
    // Deliberately excludes the bare "المنتخب الوطني": every country's press
    // calls its own side that, and on live ElBotola copy it pulled in an
    // Argentina story. The unqualified form is a supporting signal instead.
    terms: [
      "المنتخب المغربي",
      "المنتخب الوطني المغربي",
      "اسود الاطلس",
      "الجامعة الملكية لكرة القدم",
      "جامعة الكرة المغربية",
      "frmf",
      "lions de l atlas",
      "equipe nationale marocaine",
      "selection marocaine",
      "morocco national team",
    ],
  },
  {
    name: "throne_cup",
    weight: 0.5,
    terms: ["كاس العرش", "coupe du trone", "throne cup"],
  },
];

/**
 * A country name on its own is not a subject.
 *
 * Measured against live ElBotola copy: articles genuinely about Moroccan
 * football mention Morocco seven or eight times, while a Spanish-federation
 * story that lists Morocco as a 2030 World Cup co-host mentions it exactly
 * once. Two occurrences is the separating line, and below it the mention only
 * contributes supporting weight.
 */
const MOROCCO_TERMS = [
  "المغرب",
  "المغربي",
  "المغربية",
  "المغاربة",
  "maroc",
  "marocain",
  "marocaine",
  "morocco",
] as const;
export const MOROCCO_PRIMARY_THRESHOLD = 2;

/** Relevant only when a Moroccan subject is also present. */
const SUPPORTING_SIGNALS: readonly SignalGroup[] = [
  {
    name: "caf_competition",
    weight: 0.3,
    terms: [
      "دوري ابطال افريقيا",
      "كاس الكونفدرالية",
      "الكونفدرالية الافريقية",
      "كان",
      "كاس افريقيا",
      "caf",
      "ligue des champions africaine",
      "coupe de la confederation",
    ],
  },
  {
    name: "transfer",
    weight: 0.25,
    terms: [
      "انتقال",
      "صفقة",
      "التعاقد",
      "وقع",
      "يوقع",
      "الميركاتو",
      "transfert",
      "signature",
      "mercato",
      "recrue",
    ],
  },
  {
    name: "match",
    weight: 0.25,
    terms: [
      "مباراة",
      "الجولة",
      "الدورة",
      "نتيجة",
      "هدف",
      "فوز",
      "تعادل",
      "هزيمة",
      "match",
      "journee",
      "score",
      "victoire",
      "defaite",
    ],
  },
  {
    name: "squad_status",
    weight: 0.25,
    terms: [
      "اصابة",
      "الاصابة",
      "ايقاف",
      "عقوبة",
      "الغياب",
      "المدرب",
      "الاطار التقني",
      "استقالة",
      "blessure",
      "suspension",
      "entraineur",
      "selectionneur",
    ],
  },
  {
    name: "moroccan_player",
    weight: 0.3,
    terms: ["الدولي المغربي", "اللاعب المغربي", "international marocain", "joueur marocain"],
  },
];

/** Subjects that are football but not BotolaGO's beat. */
const NEGATIVE_SIGNALS: readonly SignalGroup[] = [
  {
    name: "foreign_league",
    weight: 0.45,
    terms: [
      "الدوري الانجليزي",
      "البريميرليج",
      "الدوري الاسباني",
      "الليجا",
      "الدوري الايطالي",
      "الكالتشيو",
      "الدوري الالماني",
      "البوندسليجا",
      "الدوري الفرنسي",
      "الدوري السعودي",
      "premier league",
      "la liga",
      "serie a",
      "bundesliga",
      "ligue 1",
      "saudi pro league",
    ],
  },
  {
    name: "other_sport",
    weight: 0.6,
    terms: [
      "كرة السلة",
      "التنس",
      "الفورمولا",
      "الملاكمة",
      "الكرة الطائرة",
      "العاب القوى",
      "basketball",
      "tennis",
      "formule 1",
      "handball",
      "athletisme",
    ],
  },
];

function countMatches(haystack: string, group: SignalGroup): number {
  let hits = 0;
  for (const term of group.terms) {
    const normalizedTerm = normalizeEntityName(term);
    if (normalizedTerm && haystack.includes(normalizedTerm)) hits += 1;
  }
  return hits;
}

/** Total occurrences, not distinct terms: repetition is what signals a subject. */
function countOccurrences(haystack: string, terms: readonly string[]): number {
  let total = 0;
  for (const term of terms) {
    const normalizedTerm = normalizeEntityName(term);
    if (!normalizedTerm) continue;
    let index = haystack.indexOf(normalizedTerm);
    while (index !== -1) {
      total += 1;
      index = haystack.indexOf(normalizedTerm, index + normalizedTerm.length);
    }
  }
  return total;
}

export interface RelevanceInput {
  readonly title: string | null;
  readonly text: string;
  readonly section?: string | null;
  readonly language: NewsSourceLanguage;
  /** Entity ids already resolved from the catalog, if resolution ran first. */
  readonly resolvedTeamCount?: number;
  readonly resolvedPlayerCount?: number;
}

export interface RelevanceOptions {
  /** Score at or above which an item proceeds. */
  readonly threshold?: number;
}

export const DEFAULT_RELEVANCE_THRESHOLD = 0.5;

/**
 * Scores an article against BotolaGO's beat.
 *
 * A primary signal (Botola, a Moroccan club, the national team, the Throne
 * Cup) alone is enough. Supporting signals only accumulate on top of one;
 * "a transfer happened somewhere" is not BotolaGO news. Resolving to a club
 * or player already in the catalog is itself strong evidence and is scored as
 * a primary signal.
 */
export function scoreRelevance(
  input: RelevanceInput,
  options: RelevanceOptions = {},
): RelevanceDecision {
  const threshold = options.threshold ?? DEFAULT_RELEVANCE_THRESHOLD;
  // The headline carries the subject; weight it by repeating it once.
  const haystack = normalizeEntityName(
    [input.title, input.title, input.section, input.text].filter(Boolean).join(" \n "),
  );

  const matched: string[] = [];
  let primaryScore = 0;
  let supportingScore = 0;
  let negativeScore = 0;

  const catalogHits = (input.resolvedTeamCount ?? 0) + (input.resolvedPlayerCount ?? 0);
  if (catalogHits > 0) {
    primaryScore += 0.6;
    matched.push(`catalog_entity(${catalogHits})`);
  }

  for (const group of PRIMARY_SIGNALS) {
    const hits = countMatches(haystack, group);
    if (hits === 0) continue;
    matched.push(`${group.name}(${hits})`);
    primaryScore += group.weight * Math.min(hits, 3);
  }

  const moroccoMentions = countOccurrences(haystack, MOROCCO_TERMS);
  if (moroccoMentions > 0) {
    matched.push(`morocco(${moroccoMentions})`);
    if (moroccoMentions >= MOROCCO_PRIMARY_THRESHOLD) {
      primaryScore += 0.5 * Math.min(moroccoMentions / MOROCCO_PRIMARY_THRESHOLD, 3);
    } else {
      supportingScore += 0.15;
    }
  }
  for (const group of SUPPORTING_SIGNALS) {
    const hits = countMatches(haystack, group);
    if (hits === 0) continue;
    matched.push(`${group.name}(${hits})`);
    supportingScore += group.weight * Math.min(hits, 2);
  }
  for (const group of NEGATIVE_SIGNALS) {
    const hits = countMatches(haystack, group);
    if (hits === 0) continue;
    matched.push(`-${group.name}(${hits})`);
    negativeScore += group.weight * Math.min(hits, 2);
  }

  const hasPrimary = primaryScore > 0;
  // Supporting evidence cannot carry an article on its own, and it is capped
  // so a long article full of the word "match" cannot out-vote the absence of
  // any Moroccan subject.
  const rawScore = hasPrimary
    ? primaryScore + Math.min(supportingScore, 0.4) - negativeScore
    : Math.min(supportingScore, 0.35) - negativeScore;
  const score = Math.max(0, Math.min(1, rawScore));

  if (!hasPrimary) {
    return {
      relevant: false,
      score,
      reason:
        "No Botola Pro, Moroccan club, Moroccan player, FRMF, Throne Cup or Moroccan national-team subject was found.",
      matchedSignals: matched,
    };
  }

  if (score < threshold) {
    return {
      relevant: false,
      score,
      reason: `Moroccan football signals were present but outweighed by off-beat subjects (score ${score.toFixed(2)} < ${threshold}).`,
      matchedSignals: matched,
    };
  }

  return {
    relevant: true,
    score,
    reason: `Matched BotolaGO coverage signals: ${matched.slice(0, 6).join(", ")}.`,
    matchedSignals: matched,
  };
}
