// PLACEHOLDER prize rules for /prizes/terms. The owner supplies the final legal
// text; until then every value only the owner holds is a `[TODO …]` span.
//
// The spans are deliberate and tracked: `prize-terms.test.ts` pins exactly the
// five open sections, and `scripts/qa/legal-placeholder-gate.ts` refuses a
// production build while PRIZES_ENABLED is on and any span survives. So this
// page can be reviewed on a preview but cannot go live unfinished.
//
// The rules that are not TODOs describe what the code does
// (supabase/migrations/20260924120000_fantasy_prizes.sql) and repeat nothing
// the General Terms do not already say (section 7). Each `[…]` span stays
// under 80 characters so the gate's pattern sees it.

import type { Language } from "@/types/domain";
import type { LegalDocument } from "./documents";

export const PRIZE_TERMS: Readonly<Record<Language, LegalDocument>> = {
  fr: {
    title: "Règlement des lots — BotolaGO Fantasy",
    blocks: [
      {
        type: "paragraph",
        text: "Version provisoire. Ce règlement complète la section 7 des Conditions Générales d'Utilisation ; en cas de contradiction, le texte définitif publié ici prévaudra.",
      },
      { type: "heading", text: "1. Organisateur" },
      {
        type: "paragraph",
        text: "[TODO : organisateur — dénomination, forme, RC, ICE et siège de l'entité]",
      },
      { type: "heading", text: "2. Sponsor et fourniture des lots" },
      {
        type: "paragraph",
        text: "[TODO : sponsor fournisseur des lots — identité et rôle dans la remise]",
      },
      { type: "heading", text: "3. Participation et éligibilité" },
      {
        type: "list",
        items: [
          "La participation est gratuite : aucun achat, pari ou dépôt n'est demandé.",
          "Un seul compte par personne physique.",
          "[TODO : conditions d'éligibilité — âge, résidence, personnes exclues]",
        ],
      },
      { type: "heading", text: "4. Lots et désignation des gagnants" },
      {
        type: "list",
        items: [
          "Lot de la journée : le meilleur score de la journée, une fois ses points définitifs.",
          "Lot mensuel : le meilleur total sur un bloc de 4 journées consécutives (J1–J4, J5–J8…). Si le nombre de journées n'est pas un multiple de 4, les 2 ou 3 journées restantes forment le dernier bloc ; une journée restante seule rejoint le bloc précédent.",
          "Lot de la saison : le meilleur total de la saison après la dernière journée.",
          "Lot de ligue : le leader de chaque ligue comptant au moins 10 membres actifs en fin de saison. Un seul lot de ligue par personne et par saison.",
          "Un même compte ne peut pas gagner le lot de la journée plus de deux fois par saison.",
          "En cas d'égalité de points : le moins de transferts effectués sur la période (hors Wildcard et Free Hit), puis l'équipe créée le plus tôt.",
          "Les comptes du personnel et les comptes signalés pour fraude présumée ne peuvent pas gagner : le lot revient au participant éligible suivant.",
        ],
      },
      { type: "heading", text: "5. Vérification et remise des lots" },
      {
        type: "list",
        items: [
          "Chaque gagnant est vérifié manuellement, pièce d'identité à l'appui, avant la remise de son lot.",
          "[TODO : délai et modalités de réclamation des lots]",
        ],
      },
      { type: "heading", text: "6. Absence de contrepartie en espèces" },
      {
        type: "paragraph",
        text: "[TODO : clause d'absence de contrepartie en espèces]",
      },
      { type: "heading", text: "7. Publication des gagnants" },
      {
        type: "paragraph",
        text: "La page des lots affiche le nom d'équipe, un pseudonyme masqué et les points de chaque gagnant vérifié. Aucun nom réel ni adresse e-mail n'y est publié.",
      },
    ],
  },
  ar: {
    title: "نظام الجوائز — BotolaGO Fantasy",
    blocks: [
      {
        type: "paragraph",
        text: "نسخة مؤقتة. يُكمِّل هذا النظام البند 7 من الشروط العامة للاستخدام، وفي حال التعارض يسري النص النهائي المنشور هنا.",
      },
      { type: "heading", text: "1. الجهة المنظِّمة" },
      {
        type: "paragraph",
        text: "[TODO: الجهة المنظِّمة — التسمية والشكل والسجل التجاري والتعريف الموحد والمقر]",
      },
      { type: "heading", text: "2. الراعي وتوفير الجوائز" },
      {
        type: "paragraph",
        text: "[TODO: الراعي مُوفِّر الجوائز — هويته ودوره في التسليم]",
      },
      { type: "heading", text: "3. المشاركة والأهلية" },
      {
        type: "list",
        items: [
          "المشاركة مجانية: لا يُطلب أي شراء أو رهان أو إيداع.",
          "حساب واحد لكل شخص طبيعي.",
          "[TODO: شروط الأهلية — السن والإقامة والأشخاص المستثنون]",
        ],
      },
      { type: "heading", text: "4. الجوائز وتحديد الفائزين" },
      {
        type: "list",
        items: [
          "جائزة الجولة: صاحب أعلى نقاط في الجولة بعد اعتماد نقاطها نهائياً.",
          "الجائزة الشهرية: صاحب أعلى مجموع خلال مجموعة من 4 جولات متتالية (ج1–ج4، ج5–ج8…). إذا لم يكن عدد الجولات من مضاعفات 4، تُشكِّل الجولتان أو الجولات الثلاث المتبقية المجموعة الأخيرة، وتُضَم جولة وحيدة متبقية إلى المجموعة السابقة.",
          "جائزة الموسم: صاحب أعلى مجموع في الموسم بعد الجولة الأخيرة.",
          "جائزة الدوري: متصدر كل دوري يضم 10 أعضاء نشطين على الأقل في نهاية الموسم. جائزة دوري واحدة لكل شخص في الموسم.",
          "لا يمكن للحساب نفسه الفوز بجائزة الجولة أكثر من مرتين في الموسم.",
          "عند التعادل في النقاط: الأقل انتقالات خلال الفترة (دون احتساب Wildcard وFree Hit)، ثم الفريق الذي أُنشئ أولاً.",
          "لا يمكن لحسابات الطاقم ولا للحسابات المشتبه في احتيالها الفوز، وتؤول الجائزة إلى المشارك المؤهل التالي.",
        ],
      },
      { type: "heading", text: "5. التحقق وتسليم الجوائز" },
      {
        type: "list",
        items: [
          "يُتحقَّق من كل فائز يدوياً بواسطة وثيقة الهوية قبل تسليم جائزته.",
          "[TODO: أجل المطالبة بالجوائز وطريقتها]",
        ],
      },
      { type: "heading", text: "6. عدم استبدال الجوائز بمقابل نقدي" },
      {
        type: "paragraph",
        text: "[TODO: بند عدم استبدال الجوائز بمقابل نقدي]",
      },
      { type: "heading", text: "7. نشر الفائزين" },
      {
        type: "paragraph",
        text: "تعرض صفحة الجوائز اسم الفريق واسم مستخدم مُقنَّعاً ونقاط كل فائز تم التحقق منه. لا يُنشر أي اسم حقيقي ولا عنوان بريد إلكتروني.",
      },
    ],
  },
};

/** The five sections the owner still has to supply, in document order. */
export const PRIZE_TERMS_OPEN_SECTIONS = [
  "organiser",
  "sponsor",
  "eligibility",
  "collection_deadline",
  "no_cash_alternative",
] as const;
