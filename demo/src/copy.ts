/**
 * The few lines the demo needs that the product does not have: the sponsor
 * placements, the matchday reveal, the sample-data label. Everything else on
 * screen is the product's own dictionary, through `useI18n().t`.
 */
import { useI18n } from "@/i18n/provider";

const copy = {
  fr: {
    sampleData: "Données de démonstration",
    sponsorPlaceholder: "Votre marque",
    presentedBy: "Présenté par",
    gameweekPresentedBy: "Journée {n} présentée par",
    rankingPresentedBy: "Classement présenté par",
    prizesOfferedBy: "Lots offerts par",
    sponsorPitch: "Votre marque aux côtés des managers de la Botola Pro, à chaque journée.",
    sponsorCta: "Découvrir",
    sponsorKicker: "Partenaire officiel",
    pickEleven: "Choisissez vos 11",
    formation: "Schéma",
    players: "Joueurs",
    budget: "Budget",
    elevenOf: "{n}/11",
    captainHint: "Touchez un joueur pour lui donner le brassard de capitaine.",
    captainMissing: "Choisissez un capitaine et un vice-capitaine.",
    completeFirst: "Complétez vos 11 joueurs pour continuer.",
    confirmTeam: "Valider l’équipe",
    kickoffKicker: "Journée {n}",
    kickoffTitle: "Place au match",
    kickoffBody:
      "Votre équipe est validée. Les 8 matchs de la journée se jouent, vos joueurs marquent des points.",
    playGameweek: "Jouer la journée",
    resultsTitle: "Résultats de la journée",
    yourScore: "Votre score",
    seePoints: "Voir mes points",
    seeRanking: "Voir le classement",
    elsewhereTitle: "Dans l’application complète",
    elsewhereBody:
      "Cette rubrique existe dans BotolaGO. La démo se concentre sur le Fantasy : équipe, points et classements.",
    backToFantasy: "Retour au Fantasy",
    youName: "Vous",
    teamReady: "Équipe validée pour la journée {n}",
    gameweekRankOf: "de la journée, sur {total} managers",
  },
  ar: {
    sampleData: "بيانات تجريبية",
    sponsorPlaceholder: "علامتكم التجارية",
    presentedBy: "برعاية",
    gameweekPresentedBy: "الجولة {n} برعاية",
    rankingPresentedBy: "الترتيب برعاية",
    prizesOfferedBy: "الجوائز مقدمة من",
    sponsorPitch: "علامتكم التجارية إلى جانب مدربي البطولة الاحترافية في كل جولة.",
    sponsorCta: "اكتشف",
    sponsorKicker: "شريك رسمي",
    pickEleven: "اختر لاعبيك الـ11",
    formation: "الخطة",
    players: "اللاعبون",
    budget: "الميزانية",
    elevenOf: "{n}/11",
    captainHint: "المس لاعبًا لتمنحه شارة القائد.",
    captainMissing: "اختر القائد ونائب القائد.",
    completeFirst: "أكمل لاعبيك الـ11 للمتابعة.",
    confirmTeam: "تأكيد الفريق",
    kickoffKicker: "الجولة {n}",
    kickoffTitle: "انطلاق المباريات",
    kickoffBody: "تم تأكيد فريقك. تُلعب مباريات الجولة الثماني ويجمع لاعبوك النقاط.",
    playGameweek: "لعب الجولة",
    resultsTitle: "نتائج الجولة",
    yourScore: "نقاطك",
    seePoints: "عرض نقاطي",
    seeRanking: "عرض الترتيب",
    elsewhereTitle: "في التطبيق الكامل",
    elsewhereBody:
      "هذا القسم موجود في BotolaGO. يركز العرض على الفانتازي: الفريق والنقاط والترتيب.",
    backToFantasy: "العودة إلى الفانتازي",
    youName: "أنت",
    teamReady: "تم تأكيد الفريق للجولة {n}",
    gameweekRankOf: "في هذه الجولة من أصل {total} مدربًا",
  },
} as const;

export type DemoCopyKey = keyof (typeof copy)["fr"];

export function useDemoCopy() {
  const { lang } = useI18n();
  const table = lang === "ar" ? copy.ar : copy.fr;
  return (key: DemoCopyKey, values: Record<string, string | number> = {}) =>
    Object.entries(values).reduce<string>(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      table[key],
    );
}
