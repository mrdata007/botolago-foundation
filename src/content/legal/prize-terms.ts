// Prize rules for /prizes/terms, version 1.2.
//
// Version 1.2 (2026-10-06, owner decisions for the App Store and Google Play
// submission): the organiser is the person who holds the Apple developer
// account, because Apple guideline 5.3.2 requires the developer to be the
// sponsor of a contest (Go Sports Technologies is not registered yet; it takes
// over once it is); the contest runs for the 2026-27 season; only residents of
// Morocco can win; the prizes and their value are those shown on /prizes; and
// Apple and Google are named as not involved, as both stores require.
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
// There is no league prize, and the rules do not mention one (owner decision,
// 2026-09-24). The database still supports the mini_league tier, so an admin
// could switch one on from /admin/prizes: it would then be awarded without
// being in these rules. Section 4 needs its rule back before that happens.
//
// `scripts/qa/legal-placeholder-gate.ts` still reads this file while
// PRIZES_ENABLED is on and refuses a production build if a `[…]` span appears.

import type { Language } from "@/types/domain";
import type { LegalDocument } from "./documents";

export const PRIZE_ORGANISER = "Abdelali Sarhane";

export const PRIZE_TERMS: Readonly<Record<Language, LegalDocument>> = {
  fr: {
    title: "Règlement des lots — BotolaGO Fantasy",
    blocks: [
      {
        type: "paragraph",
        text: "Version 1.2 — en vigueur au 6 octobre 2026. Ce règlement complète la section 7 des Conditions Générales d'Utilisation ; en cas de contradiction, le présent règlement prévaut.",
      },
      { type: "heading", text: "1. Organisateur" },
      {
        type: "paragraph",
        text: `L'organisateur du concours doté de BotolaGO Fantasy est ${PRIZE_ORGANISER}, personne physique domiciliée à Agadir (Maroc), éditeur de l'application sur l'App Store et sur Google Play, agissant pour le compte de Go Sports Technologies (société en cours de constitution). Une fois immatriculée, Go Sports Technologies deviendra l'organisateur et le présent règlement sera mis à jour. Contact : support@botolago.com.`,
      },
      { type: "heading", text: "2. Fourniture des lots" },
      {
        type: "paragraph",
        text: `Les lots sont fournis et remis par ${PRIZE_ORGANISER}, organisateur du concours.`,
      },
      { type: "heading", text: "3. Durée et territoire" },
      {
        type: "list",
        items: [
          "Le concours couvre la saison 2026-2027 de la Botola Pro : il commence à la première journée Fantasy de cette saison et prend fin après sa dernière journée.",
          "Seules les personnes résidant au Maroc peuvent gagner un lot. Les lots sont remis au Maroc, et un justificatif de résidence peut être demandé lors de la vérification du gagnant.",
        ],
      },
      { type: "heading", text: "4. Participation et éligibilité" },
      {
        type: "list",
        items: [
          "La participation est gratuite : aucun achat, pari ou dépôt n'est demandé.",
          "Un seul compte par personne physique.",
          "Aucune condition d'âge n'est propre aux lots : seules s'appliquent les conditions d'inscription prévues par les Conditions Générales d'Utilisation.",
        ],
      },
      { type: "heading", text: "5. Lots et désignation des gagnants" },
      {
        type: "list",
        items: [
          "La nature et la valeur indicative de chaque lot sont celles affichées sur la page des lots de BotolaGO pour la période concernée. Une période pour laquelle aucun lot n'y est affiché n'est pas dotée.",
          "Lot de la journée : le meilleur score de la journée, une fois ses points définitifs.",
          "Lot mensuel : le meilleur total sur un bloc de 4 journées consécutives (J1–J4, J5–J8…). Si le nombre de journées n'est pas un multiple de 4, les 2 ou 3 journées restantes forment le dernier bloc ; une journée restante seule rejoint le bloc précédent.",
          "Lot de la saison : le meilleur total de la saison après la dernière journée.",
          "Un même compte ne peut pas gagner le lot de la journée plus de deux fois par saison.",
          "En cas d'égalité de points : le moins de transferts effectués sur la période (hors Wildcard et Free Hit), puis l'équipe créée le plus tôt.",
          "Les comptes du personnel et les comptes signalés pour fraude présumée ne peuvent pas gagner : le lot revient au participant éligible suivant.",
        ],
      },
      { type: "heading", text: "6. Vérification et remise des lots" },
      {
        type: "list",
        items: [
          "Chaque gagnant est vérifié manuellement, pièce d'identité à l'appui, avant la remise de son lot.",
          "L'équipe BotolaGO contacte chaque gagnant pour organiser la remise de son lot. Un gagnant qui ne répond pas dans les 15 jours suivant ce contact perd son lot, comme le prévoient les Conditions Générales d'Utilisation.",
        ],
      },
      { type: "heading", text: "7. Absence de contrepartie en espèces" },
      {
        type: "paragraph",
        text: "Les lots ne sont ni échangeables, ni cessibles, ni convertibles en espèces.",
      },
      { type: "heading", text: "8. Publication des gagnants" },
      {
        type: "paragraph",
        text: "La page des lots affiche le nom d'équipe, un pseudonyme masqué et les points de chaque gagnant vérifié. Aucun nom réel ni adresse e-mail n'y est publié.",
      },
      { type: "heading", text: "9. Apple et Google" },
      {
        type: "paragraph",
        text: "Apple Inc. et Google LLC ne sont ni organisateurs ni sponsors de ce concours et n'y sont associés d'aucune manière. Toute question ou réclamation relative au concours doit être adressée à l'organisateur, à support@botolago.com.",
      },
    ],
  },
  ar: {
    title: "نظام الجوائز — BotolaGO Fantasy",
    blocks: [
      {
        type: "paragraph",
        text: "الإصدار 1.2 — ساري المفعول ابتداءً من 6 أكتوبر 2026. يُكمِّل هذا النظام البند 7 من الشروط العامة للاستخدام، وفي حال التعارض يسري هذا النظام.",
      },
      { type: "heading", text: "1. الجهة المنظِّمة" },
      {
        type: "paragraph",
        text: `منظِّم مسابقة جوائز BotolaGO Fantasy هو ${PRIZE_ORGANISER}، شخص ذاتي مقيم بأكادير (المغرب)، ناشر التطبيق على App Store وGoogle Play، يتصرف لحساب Go Sports Technologies (شركة في طور التأسيس). وبعد تسجيلها، تصبح Go Sports Technologies الجهة المنظِّمة ويُحدَّث هذا النظام. للتواصل: support@botolago.com.`,
      },
      { type: "heading", text: "2. توفير الجوائز" },
      {
        type: "paragraph",
        text: `يتولّى ${PRIZE_ORGANISER}، منظِّم المسابقة، توفير الجوائز وتسليمها.`,
      },
      { type: "heading", text: "3. المدة والنطاق الجغرافي" },
      {
        type: "list",
        items: [
          "تشمل المسابقة موسم 2026-2027 من البطولة الاحترافية: تبدأ مع أول جولة Fantasy من هذا الموسم وتنتهي بعد آخر جولة منه.",
          "لا يمكن الفوز بالجوائز إلا للأشخاص المقيمين بالمغرب. تُسلَّم الجوائز داخل المغرب، ويمكن طلب ما يثبت الإقامة عند التحقق من الفائز.",
        ],
      },
      { type: "heading", text: "4. المشاركة والأهلية" },
      {
        type: "list",
        items: [
          "المشاركة مجانية: لا يُطلب أي شراء أو رهان أو إيداع.",
          "حساب واحد لكل شخص طبيعي.",
          "لا يوجد شرط سنّ خاص بالجوائز: تسري فقط شروط التسجيل المنصوص عليها في الشروط العامة للاستخدام.",
        ],
      },
      { type: "heading", text: "5. الجوائز وتحديد الفائزين" },
      {
        type: "list",
        items: [
          "طبيعة كل جائزة وقيمتها التقريبية هي المعروضة في صفحة الجوائز على BotolaGO للفترة المعنية. ولا تُمنح أي جائزة عن فترة لم تُعرض لها جائزة في تلك الصفحة.",
          "جائزة الجولة: صاحب أعلى نقاط في الجولة بعد اعتماد نقاطها نهائياً.",
          "الجائزة الشهرية: صاحب أعلى مجموع خلال مجموعة من 4 جولات متتالية (ج1–ج4، ج5–ج8…). إذا لم يكن عدد الجولات من مضاعفات 4، تُشكِّل الجولتان أو الجولات الثلاث المتبقية المجموعة الأخيرة، وتُضَم جولة وحيدة متبقية إلى المجموعة السابقة.",
          "جائزة الموسم: صاحب أعلى مجموع في الموسم بعد الجولة الأخيرة.",
          "لا يمكن للحساب نفسه الفوز بجائزة الجولة أكثر من مرتين في الموسم.",
          "عند التعادل في النقاط: الأقل انتقالات خلال الفترة (دون احتساب Wildcard وFree Hit)، ثم الفريق الذي أُنشئ أولاً.",
          "لا يمكن لحسابات الطاقم ولا للحسابات المشتبه في احتيالها الفوز، وتؤول الجائزة إلى المشارك المؤهل التالي.",
        ],
      },
      { type: "heading", text: "6. التحقق وتسليم الجوائز" },
      {
        type: "list",
        items: [
          "يُتحقَّق من كل فائز يدوياً بواسطة وثيقة الهوية قبل تسليم جائزته.",
          "يتواصل فريق BotolaGO مع كل فائز لترتيب تسليم جائزته. ويفقد الفائز جائزته إذا لم يستجب خلال 15 يوماً من هذا التواصل، وفقاً لما تنص عليه الشروط العامة للاستخدام.",
        ],
      },
      { type: "heading", text: "7. عدم استبدال الجوائز بمقابل نقدي" },
      {
        type: "paragraph",
        text: "الجوائز غير قابلة للاستبدال أو التنازل أو التحويل إلى نقد.",
      },
      { type: "heading", text: "8. نشر الفائزين" },
      {
        type: "paragraph",
        text: "تعرض صفحة الجوائز اسم الفريق واسم مستخدم مُقنَّعاً ونقاط كل فائز تم التحقق منه. لا يُنشر أي اسم حقيقي ولا عنوان بريد إلكتروني.",
      },
      { type: "heading", text: "9. Apple وGoogle" },
      {
        type: "paragraph",
        text: "شركتا Apple Inc. وGoogle LLC ليستا منظِّمتين ولا راعيتين لهذه المسابقة، ولا علاقة لهما بها بأي شكل من الأشكال. تُوجَّه كل الأسئلة أو الشكايات المتعلقة بالمسابقة إلى المنظِّم عبر support@botolago.com.",
      },
    ],
  },
};
