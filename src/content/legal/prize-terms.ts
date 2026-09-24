// Prize rules for /prizes/terms, version 1.0.
//
// The owner supplied the five values only they hold on 2026-09-24: the
// organiser, who provides and hands over the prizes, the age rule, how winners
// are contacted, and the no-cash clause. The rest describes what the code does
// (supabase/migrations/20260924120000_fantasy_prizes.sql) and repeats nothing
// the General Terms do not already say (section 7).
//
// The age rule adds nothing to the General Terms: the owner set no minimum age
// for prizes, and the General Terms and the Privacy Policy already restrict
// accounts to adults, so a prize-specific age would only contradict them.
//
// Section 2 names who provides the prizes. A sponsor can be put on a prize from
// /admin/prizes; when one is, section 2 has to name it too.
//
// `scripts/qa/legal-placeholder-gate.ts` still reads this file while
// PRIZES_ENABLED is on and refuses a production build if a `[…]` span appears.

import type { Language } from "@/types/domain";
import type { LegalDocument } from "./documents";

export const PRIZE_TERMS: Readonly<Record<Language, LegalDocument>> = {
  fr: {
    title: "Règlement des lots — BotolaGO Fantasy",
    blocks: [
      {
        type: "paragraph",
        text: "Version 1.0 — en vigueur au 24 septembre 2026. Ce règlement complète la section 7 des Conditions Générales d'Utilisation ; en cas de contradiction, le présent règlement prévaut.",
      },
      { type: "heading", text: "1. Organisateur" },
      {
        type: "paragraph",
        text: "L'organisateur du concours doté de BotolaGO Fantasy est Go Sports Technologies.",
      },
      { type: "heading", text: "2. Fourniture des lots" },
      {
        type: "paragraph",
        text: "Les lots sont fournis et remis par Go Sports Technologies.",
      },
      { type: "heading", text: "3. Participation et éligibilité" },
      {
        type: "list",
        items: [
          "La participation est gratuite : aucun achat, pari ou dépôt n'est demandé.",
          "Un seul compte par personne physique.",
          "Aucune condition d'âge n'est propre aux lots : seules s'appliquent les conditions d'inscription prévues par les Conditions Générales d'Utilisation.",
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
          "L'équipe BotolaGO contacte chaque gagnant pour organiser la remise de son lot. Un gagnant qui ne répond pas dans les 15 jours suivant ce contact perd son lot, comme le prévoient les Conditions Générales d'Utilisation.",
        ],
      },
      { type: "heading", text: "6. Absence de contrepartie en espèces" },
      {
        type: "paragraph",
        text: "Les lots ne sont ni échangeables, ni cessibles, ni convertibles en espèces.",
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
        text: "الإصدار 1.0 — ساري المفعول ابتداءً من 24 سبتمبر 2026. يُكمِّل هذا النظام البند 7 من الشروط العامة للاستخدام، وفي حال التعارض يسري هذا النظام.",
      },
      { type: "heading", text: "1. الجهة المنظِّمة" },
      {
        type: "paragraph",
        text: "الجهة المنظِّمة لمسابقة جوائز BotolaGO Fantasy هي Go Sports Technologies.",
      },
      { type: "heading", text: "2. توفير الجوائز" },
      {
        type: "paragraph",
        text: "تتولّى Go Sports Technologies توفير الجوائز وتسليمها.",
      },
      { type: "heading", text: "3. المشاركة والأهلية" },
      {
        type: "list",
        items: [
          "المشاركة مجانية: لا يُطلب أي شراء أو رهان أو إيداع.",
          "حساب واحد لكل شخص طبيعي.",
          "لا يوجد شرط سنّ خاص بالجوائز: تسري فقط شروط التسجيل المنصوص عليها في الشروط العامة للاستخدام.",
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
          "يتواصل فريق BotolaGO مع كل فائز لترتيب تسليم جائزته. ويفقد الفائز جائزته إذا لم يستجب خلال 15 يوماً من هذا التواصل، وفقاً لما تنص عليه الشروط العامة للاستخدام.",
        ],
      },
      { type: "heading", text: "6. عدم استبدال الجوائز بمقابل نقدي" },
      {
        type: "paragraph",
        text: "الجوائز غير قابلة للاستبدال أو التنازل أو التحويل إلى نقد.",
      },
      { type: "heading", text: "7. نشر الفائزين" },
      {
        type: "paragraph",
        text: "تعرض صفحة الجوائز اسم الفريق واسم مستخدم مُقنَّعاً ونقاط كل فائز تم التحقق منه. لا يُنشر أي اسم حقيقي ولا عنوان بريد إلكتروني.",
      },
    ],
  },
};
