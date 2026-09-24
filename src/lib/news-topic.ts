/**
 * The subject of a News headline, for picking an illustration when the
 * article carries no photo of its own. French and Arabic.
 *
 * Order matters: the more specific subjects are tried first, so "injured
 * striker misses the derby" is an injury story, not a match preview. A
 * headline that matches nothing gets no topic, and the card keeps its
 * section's plate.
 */
export const NEWS_TOPICS = [
  "injury",
  "referee",
  "transfer",
  "trophy",
  "press",
  "club-board",
  "coach",
  "training",
  "goal",
  "fans",
  "matchday",
  "stadium",
] as const;
export type NewsTopic = (typeof NEWS_TOPICS)[number];

const PATTERNS: Record<NewsTopic, RegExp> = {
  injury:
    /إصاب|مصاب|عملية جراحية|تعافي|يتعافى|غياب|يغيب|blessure|blessé|opéré|opération|convalescen|rétabli|forfait|absen/i,
  referee:
    /حكم|تحكيم|عقوب|إيقاف|موقوف|الطرد|انضباط|غرامة|الفار|arbitr|sanction|suspen|expuls|discipl|amende|\bVAR\b/i,
  transfer:
    /تعاقد|انتقال|صفقة|ينضم|انضمام|توقيع|يوقع|عقد|ميركاتو|إعارة|رحيل|يغادر|فسخ|transfert|mercato|signe|signature|recrue|prêt|contrat|rejoint|quitte|officialise/i,
  trophy: /لقب|تتويج|يتوج|الكأس|الصدارة|الترتيب|titre|sacre|sacré|trophée|coupe|classement|leader/i,
  press: /تصريح|ندوة|يصرح|:\s*["«“]|«|conférence|déclar|interview|entretien|confie/i,
  "club-board":
    /رئيس|الجمع العام|المكتب المديري|استقالة|الجامعة|العصبة|المنخرط|اجتماع|ميزانية|présiden|assemblée|comité|démission|fédération|FRMF|\bligue\b|LNFP|budget/i,
  coach: /مدرب|الطاقم التقني|الناخب|entraîneur|coach|sélectionneur|staff technique/i,
  training: /تداريب|تدريب|حصة|معسكر|تحضير|استعداد|ودي|entraînement|stage|préparati|prépare|amical/i,
  goal: /فوز|يفوز|هزيمة|تعادل|يتعادل|هدف|أهداف|سجل|انتصار|victoire|battu|défaite|\bnul\b|\bbut\b|s'impose|renvers/i,
  fans: /جماهير|الجمهور|المشجع|تذاكر|التذاكر|الاشتراك|الألتراس|المدرجات|supporters|public|billet|abonnement|ultras|tribune/i,
  matchday:
    /مواجهة|مباراة|يواجه|الجولة|قمة|ديربي|التشكيلة|\bmatch\b|affronte|journée|derby|\bchoc\b|compo/i,
  stadium: /ملعب|ملاعب|\bstade\b|pelouse|enceinte/i,
};

export function topicForHeadline(headline: string | undefined | null): NewsTopic | null {
  if (!headline) return null;
  return NEWS_TOPICS.find((topic) => PATTERNS[topic].test(headline)) ?? null;
}
