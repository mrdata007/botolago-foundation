// GENERATED FROM THE OWNER-SUPPLIED SOURCE DOCUMENT. Do not hand-edit prose here.
//
// The Terms and the Privacy Policy are binding documents about a real operator's
// real data handling. They were written by the owner and transcribed mechanically
// rather than retyped, so the words on the page are the words that were approved.
// Editing this file by hand reintroduces exactly the drift that was avoided.
//
// The one substitution made during generation is the Supabase region: the source
// said "[confirmer la région du projet]" and the project is verifiably
// eu-west-3 (Paris), which is a fact rather than a business decision.
//
// Every remaining [bracketed] value is the owner's to supply, and
// legal-content.test.ts fails while any of them survive -- these pages must not
// reach production carrying "[Raison sociale]" or an unissued CNDP number.

import type { Language } from "@/types/domain";

export type LegalBlock =
  | { readonly type: "heading"; readonly text: string }
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "list"; readonly items: readonly string[] }
  | {
      readonly type: "table";
      readonly head: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

export interface LegalDocument {
  readonly title: string;
  readonly blocks: readonly LegalBlock[];
}

export const TERMS: Readonly<Record<Language, LegalDocument>> = {
  fr: {
    title: "Conditions Générales d'Utilisation (FR)",
    blocks: [
      {
        type: "paragraph",
        text: "Version 1.0 — en vigueur au 21 septembre 2026. Les champs entre crochets sont à compléter avant publication.",
      },
      { type: "heading", text: "1. Éditeur et objet" },
      {
        type: "paragraph",
        text: "L'application BotolaGO (ci-après « l'Application ») est éditée par [Raison sociale], société de droit marocain, RC n° [numéro RC], ICE n° [numéro ICE], siège social : [adresse], Agadir, Maroc (ci-après « BotolaGO » ou « nous »). Contact : [email de contact].",
      },
      {
        type: "paragraph",
        text: "Les présentes Conditions Générales d'Utilisation (« CGU ») régissent l'accès et l'utilisation de l'Application, un jeu de fantasy football gratuit basé sur les performances réelles des joueurs de la Botola Pro. En créant un compte, vous acceptez sans réserve les présentes CGU et la Politique de confidentialité. Si vous les refusez, n'utilisez pas l'Application.",
      },
      { type: "heading", text: "2. Absence d'affiliation" },
      {
        type: "paragraph",
        text: "BotolaGO est un service indépendant. Il n'est ni affilié, ni sponsorisé, ni approuvé par la Fédération Royale Marocaine de Football (FRMF), la Ligue Nationale de Football Professionnel (LNFP), les clubs de la Botola Pro ou leurs joueurs. Les noms de compétitions, de clubs et de joueurs sont utilisés à des fins d'identification et d'information uniquement ; leurs marques restent la propriété de leurs titulaires respectifs.",
      },
      { type: "heading", text: "3. Éligibilité" },
      {
        type: "list",
        items: [
          "Vous devez avoir 18 ans révolus et la capacité juridique de contracter.",
          "Un seul compte par personne physique. Les comptes multiples, partagés, automatisés ou créés au nom d'un tiers sont interdits.",
          "Les salariés, dirigeants et prestataires de BotolaGO, ainsi que les personnes intervenant dans l'organisation de la Botola Pro (arbitres, officiels, joueurs, staffs), ne peuvent pas participer aux classements dotés.",
          "Certaines dotations peuvent être réservées aux résidents du Maroc ; la restriction est précisée dans le règlement du concours concerné.",
        ],
      },
      { type: "heading", text: "4. Compte utilisateur" },
      {
        type: "paragraph",
        text: "Vous vous engagez à fournir des informations exactes et à les maintenir à jour. Vous êtes seul responsable de la confidentialité de vos identifiants et de toute activité effectuée depuis votre compte. Informez-nous sans délai de tout accès non autorisé à [email de contact].",
      },
      {
        type: "paragraph",
        text: "Nous pouvons suspendre ou clôturer un compte inactif depuis plus de 24 mois, après notification.",
      },
      { type: "heading", text: "5. Nature du jeu" },
      {
        type: "paragraph",
        text: "BotolaGO est un jeu d'adresse gratuit : aucun achat, aucune mise et aucun dépôt d'argent ne sont requis pour jouer ni pour prétendre à une dotation. Le classement dépend exclusivement des choix de l'utilisateur (composition d'équipe, capitaine, transferts, jetons) appliqués aux performances réelles des joueurs. BotolaGO n'est pas un jeu de hasard, ne propose aucun pari et ne permet aucun gain en argent lié à une mise.",
      },
      { type: "heading", text: "6. Règles du jeu" },
      {
        type: "list",
        items: [
          "Les règles de composition d'équipe, de budget, de transferts, de jetons (chips) et le barème de points sont publiés dans l'Application, rubrique « Règles ». Elles font partie intégrante des CGU.",
          "Les points sont calculés à partir des données officielles de match fournies par notre fournisseur de données sportives. En cas d'erreur ou de correction ultérieure des statistiques officielles, BotolaGO peut recalculer les points ; les classements corrigés font foi.",
          "Les délais de validation (deadline avant chaque journée) sont indiqués dans l'Application, heure de Rabat. Toute équipe non validée avant la deadline est reconduite automatiquement.",
          "Match reporté, annulé ou arrêté : les points sont attribués selon les données officielles disponibles au moment de la clôture de la journée. BotolaGO décide seule du traitement des cas non prévus.",
          "Les ligues privées sont créées et gérées par les utilisateurs sous leur responsabilité ; BotolaGO n'arbitre pas les litiges entre membres d'une ligue privée.",
        ],
      },
      { type: "heading", text: "7. Dotations et concours sponsorisés" },
      {
        type: "list",
        items: [
          "Certains classements peuvent être dotés de lots offerts par BotolaGO ou par un sponsor. Chaque concours doté fait l'objet d'un règlement spécifique (durée, lots, critères, modalités de remise) publié dans l'Application.",
          "Les lots sont attribués au seul titulaire du compte gagnant. Une vérification d'identité (pièce d'identité, justificatif de résidence) est exigée avant remise. Un gagnant qui ne répond pas dans un délai de 15 jours, ou dont le compte enfreint les CGU, perd son lot.",
          "Les lots ne sont ni échangeables, ni cessibles, ni convertibles en espèces, sauf mention contraire dans le règlement du concours.",
          "BotolaGO ne prélève aucun frais pour participer. Les éventuels impôts et taxes applicables aux lots sont à la charge du gagnant selon la législation en vigueur.",
        ],
      },
      { type: "heading", text: "8. Fair-play et comportements interdits" },
      {
        type: "paragraph",
        text: "Sont interdits, et peuvent entraîner la suspension immédiate du compte et l'annulation des points ou lots :",
      },
      {
        type: "list",
        items: [
          "l'utilisation de robots, scripts, émulateurs ou tout moyen automatisé ;",
          "la création ou l'utilisation de comptes multiples, la collusion entre comptes ;",
          "l'exploitation d'un bug ou d'une faille de l'Application ;",
          "l'accès non autorisé aux systèmes, l'extraction de données (scraping), l'ingénierie inverse ;",
          "les noms d'équipe, de ligue ou contenus injurieux, discriminatoires, à caractère sexuel, politique ou religieux, ou portant atteinte aux droits de tiers ;",
          "toute usurpation d'identité ou fausse déclaration.",
        ],
      },
      { type: "heading", text: "9. Contenus publiés par les utilisateurs" },
      {
        type: "paragraph",
        text: "Vous conservez vos droits sur les contenus que vous publiez (noms d'équipe, avatars, messages). Vous accordez à BotolaGO une licence gratuite, mondiale et non exclusive pour les afficher dans l'Application et dans ses communications (classements, réseaux sociaux) pour la durée d'utilisation du service. BotolaGO peut modérer ou retirer tout contenu contraire aux CGU sans préavis.",
      },
      { type: "heading", text: "10. Propriété intellectuelle" },
      {
        type: "paragraph",
        text: "L'Application, son code, sa charte graphique, sa marque, son moteur de calcul et ses bases de données sont la propriété exclusive de BotolaGO ou de ses concédants. Toute reproduction, extraction ou exploitation non autorisée est interdite. Les données sportives sont fournies sous licence par un fournisseur tiers et ne peuvent être réutilisées en dehors de l'Application.",
      },
      { type: "heading", text: "11. Sponsors et publicité" },
      {
        type: "paragraph",
        text: "L'Application est financée par le sponsoring et peut afficher des contenus publicitaires ou de marque. BotolaGO ne vend pas vos données personnelles aux sponsors ; seules des statistiques agrégées et anonymisées leur sont communiquées (voir Politique de confidentialité).",
      },
      { type: "heading", text: "12. Disponibilité et modifications" },
      {
        type: "paragraph",
        text: "BotolaGO s'efforce d'assurer la disponibilité de l'Application mais ne garantit pas un fonctionnement ininterrompu ou exempt d'erreurs. Nous pouvons modifier, suspendre ou interrompre tout ou partie du service, notamment pour maintenance, ou en cas de suspension de la compétition ou d'indisponibilité des données sportives.",
      },
      {
        type: "paragraph",
        text: "Nous pouvons modifier les CGU. Toute modification substantielle est notifiée dans l'Application au moins 7 jours avant son entrée en vigueur. La poursuite de l'utilisation après cette date vaut acceptation.",
      },
      { type: "heading", text: "13. Responsabilité" },
      {
        type: "paragraph",
        text: "L'Application est fournie « en l'état ». Dans la mesure permise par la loi, BotolaGO n'est pas responsable :",
      },
      {
        type: "list",
        items: [
          "des erreurs ou retards dans les données sportives fournies par des tiers ;",
          "des pertes indirectes, de données ou d'opportunité ;",
          "des interruptions dues à des tiers (hébergeur, opérateurs télécom, magasins d'applications) ou à un cas de force majeure ;",
          "des agissements d'autres utilisateurs, notamment dans les ligues privées.",
        ],
      },
      {
        type: "paragraph",
        text: "Rien dans les CGU n'exclut la responsabilité de BotolaGO en cas de dol ou de faute lourde.",
      },
      { type: "heading", text: "14. Résiliation" },
      {
        type: "paragraph",
        text: "Vous pouvez supprimer votre compte à tout moment depuis les paramètres de l'Application ou en écrivant à [email de contact]. BotolaGO peut suspendre ou résilier votre accès, avec ou sans préavis selon la gravité, en cas de violation des CGU. La suppression du compte entraîne la perte des points, classements et lots non réclamés.",
      },
      { type: "heading", text: "15. Droit applicable et litiges" },
      {
        type: "paragraph",
        text: "Les CGU sont soumises au droit marocain. Toute réclamation doit d'abord être adressée à [email de contact] ; nous répondons sous 30 jours. À défaut de règlement amiable, les tribunaux compétents d'Agadir sont seuls compétents, sous réserve des dispositions impératives protectrices du consommateur (loi n° 31-08).",
      },
      { type: "heading", text: "16. Dispositions diverses" },
      {
        type: "paragraph",
        text: "Si une clause est jugée nulle, les autres restent applicables. Le fait pour BotolaGO de ne pas se prévaloir d'une clause ne vaut pas renonciation. En cas de divergence entre la version française et la version arabe, la version française prévaut.",
      },
    ],
  },
  ar: {
    title: "شروط الاستخدام (AR)",
    blocks: [
      {
        type: "paragraph",
        text: "الإصدار 1.0 — ساري المفعول ابتداءً من 21 سبتمبر 2026. الحقول بين معقوفتين تُستكمل قبل النشر.",
      },
      { type: "heading", text: "1. الناشر والموضوع" },
      {
        type: "paragraph",
        text: "تطبيق BotolaGO (المشار إليه فيما بعد بـ«التطبيق») تنشره [الاسم التجاري للشركة]، شركة خاضعة للقانون المغربي، السجل التجاري رقم [رقم السجل التجاري]، التعريف الموحد للمقاولة رقم [رقم ICE]، المقر الاجتماعي: [العنوان]، أكادير، المغرب (المشار إليها فيما بعد بـ«BotolaGO» أو «نحن»). للتواصل: [البريد الإلكتروني].",
      },
      {
        type: "paragraph",
        text: "تنظم شروط الاستخدام هذه («الشروط») الولوج إلى التطبيق واستعماله، وهو لعبة فانتازي مجانية لكرة القدم تعتمد على الأداء الحقيقي للاعبي البطولة الاحترافية (Botola Pro). بإنشائك حساباً، فإنك تقبل هذه الشروط وسياسة الخصوصية دون تحفظ. إذا كنت ترفضها، فلا تستعمل التطبيق.",
      },
      { type: "heading", text: "2. عدم الانتساب" },
      {
        type: "paragraph",
        text: "BotolaGO خدمة مستقلة. لا يرتبط التطبيق بالجامعة الملكية المغربية لكرة القدم ولا بالعصبة الوطنية لكرة القدم الاحترافية ولا بأندية البطولة الاحترافية أو لاعبيها، ولا يحظى برعايتهم أو اعتمادهم. تُستعمل أسماء المسابقات والأندية واللاعبين لأغراض التعريف والإعلام فقط، وتبقى علاماتهم التجارية ملكاً لأصحابها.",
      },
      { type: "heading", text: "3. الأهلية" },
      {
        type: "list",
        items: [
          "يجب أن تكون بالغاً 18 سنة كاملة ومتمتعاً بالأهلية القانونية للتعاقد.",
          "حساب واحد لكل شخص طبيعي. تُمنع الحسابات المتعددة أو المشتركة أو الآلية أو المنشأة باسم الغير.",
          "لا يحق لأجراء BotolaGO ومسيّريها ومزوّديها، ولا للأشخاص المشاركين في تنظيم البطولة الاحترافية (حكام، مسؤولون، لاعبون، أطر تقنية)، المشاركة في الترتيبات ذات الجوائز.",
          "قد تُخصص بعض الجوائز للمقيمين بالمغرب فقط؛ ويُحدد ذلك في قواعد المسابقة المعنية.",
        ],
      },
      { type: "heading", text: "4. حساب المستخدم" },
      {
        type: "paragraph",
        text: "تلتزم بتقديم معلومات صحيحة وتحديثها. أنت وحدك المسؤول عن سرية بيانات دخولك وعن كل نشاط يتم من حسابك. أخبرنا فوراً بأي ولوج غير مرخص عبر [البريد الإلكتروني].",
      },
      {
        type: "paragraph",
        text: "يجوز لنا تعليق أو إغلاق أي حساب غير نشط لأكثر من 24 شهراً بعد إشعار صاحبه.",
      },
      { type: "heading", text: "5. طبيعة اللعبة" },
      {
        type: "paragraph",
        text: "BotolaGO لعبة مهارة مجانية: لا يُشترط أي شراء أو رهان أو إيداع مالي للعب أو للمطالبة بجائزة. يعتمد الترتيب حصرياً على اختيارات المستخدم (تشكيلة الفريق، القائد، الانتقالات، الرقاقات) المطبقة على الأداء الحقيقي للاعبين. BotolaGO ليست لعبة حظ، ولا تقترح أي مراهنة، ولا تتيح أي ربح مالي مرتبط برهان.",
      },
      { type: "heading", text: "6. قواعد اللعبة" },
      {
        type: "list",
        items: [
          "تُنشر قواعد تشكيل الفريق والميزانية والانتقالات والرقاقات (chips) وجدول النقاط داخل التطبيق في قسم «القواعد»، وهي جزء لا يتجزأ من هذه الشروط.",
          "تُحتسب النقاط انطلاقاً من بيانات المباريات الرسمية التي يوفرها مزوّد البيانات الرياضية. في حال وقوع خطأ أو تصحيح لاحق للإحصائيات الرسمية، يجوز لـ BotolaGO إعادة احتساب النقاط، ويُعتد بالترتيب المصحح.",
          "تُعرض آجال تأكيد التشكيلة (الموعد النهائي قبل كل جولة) داخل التطبيق بتوقيت الرباط. كل فريق لم يُؤكد قبل الموعد النهائي يُرحّل تلقائياً.",
          "في حال تأجيل مباراة أو إلغائها أو توقفها: تُمنح النقاط وفق البيانات الرسمية المتاحة عند إقفال الجولة. تبتّ BotolaGO وحدها في الحالات غير المنصوص عليها.",
          "يُنشئ المستخدمون الدوريات الخاصة ويديرونها تحت مسؤوليتهم؛ ولا تتدخل BotolaGO في النزاعات بين أعضاء دوري خاص.",
        ],
      },
      { type: "heading", text: "7. الجوائز والمسابقات المموّلة برعاية" },
      {
        type: "list",
        items: [
          "قد تُرصد لبعض الترتيبات جوائز تقدمها BotolaGO أو أحد الرعاة. تخضع كل مسابقة ذات جوائز لقواعد خاصة (المدة، الجوائز، المعايير، طريقة التسليم) تُنشر داخل التطبيق.",
          "تُمنح الجوائز حصرياً لصاحب الحساب الفائز. يُشترط التحقق من الهوية (بطاقة التعريف، إثبات السكن) قبل التسليم. يفقد الفائز جائزته إذا لم يستجب خلال 15 يوماً أو إذا كان حسابه مخالفاً للشروط.",
          "الجوائز غير قابلة للاستبدال أو التنازل أو التحويل إلى نقد، ما لم تنص قواعد المسابقة على خلاف ذلك.",
          "لا تقتطع BotolaGO أي رسوم للمشاركة. تقع الضرائب والرسوم المطبقة على الجوائز، إن وُجدت، على عاتق الفائز وفق التشريع الجاري به العمل.",
        ],
      },
      { type: "heading", text: "8. اللعب النظيف والسلوكيات الممنوعة" },
      {
        type: "paragraph",
        text: "يُمنع ما يلي، وقد يؤدي إلى التعليق الفوري للحساب وإلغاء النقاط أو الجوائز:",
      },
      {
        type: "list",
        items: [
          "استعمال الروبوتات أو البرامج النصية أو المحاكيات أو أي وسيلة آلية؛",
          "إنشاء أو استعمال حسابات متعددة، أو التواطؤ بين الحسابات؛",
          "استغلال خلل أو ثغرة في التطبيق؛",
          "الولوج غير المرخص إلى الأنظمة، أو استخراج البيانات، أو الهندسة العكسية؛",
          "أسماء الفرق أو الدوريات أو المحتويات المسيئة أو التمييزية أو ذات الطابع الجنسي أو السياسي أو الديني، أو الماسة بحقوق الغير؛",
          "انتحال الهوية أو الإدلاء بتصريحات كاذبة.",
        ],
      },
      { type: "heading", text: "9. المحتوى المنشور من طرف المستخدمين" },
      {
        type: "paragraph",
        text: "تحتفظ بحقوقك على المحتوى الذي تنشره (أسماء الفرق، الصور الرمزية، الرسائل). وتمنح BotolaGO ترخيصاً مجانياً وعالمياً وغير حصري لعرضه داخل التطبيق وفي اتصالاتها (الترتيبات، شبكات التواصل الاجتماعي) طيلة مدة استعمالك للخدمة. يجوز لـ BotolaGO تعديل أو حذف أي محتوى مخالف للشروط دون إشعار مسبق.",
      },
      { type: "heading", text: "10. الملكية الفكرية" },
      {
        type: "paragraph",
        text: "التطبيق وشفرته وهويته البصرية وعلامته ومحرك احتساب النقاط وقواعد بياناته ملك حصري لـ BotolaGO أو لمانحي تراخيصها. يُمنع كل استنساخ أو استخراج أو استغلال غير مرخص. تُوفَّر البيانات الرياضية بموجب ترخيص من مزوّد خارجي ولا يجوز إعادة استعمالها خارج التطبيق.",
      },
      { type: "heading", text: "11. الرعاة والإعلانات" },
      {
        type: "paragraph",
        text: "يُموَّل التطبيق عبر الرعاية وقد يعرض محتويات إعلانية أو تجارية. لا تبيع BotolaGO بياناتك الشخصية للرعاة؛ ولا تُبلَّغ إليهم سوى إحصائيات مجمّعة ومجهولة الهوية (انظر سياسة الخصوصية).",
      },
      { type: "heading", text: "12. التوفر والتعديلات" },
      {
        type: "paragraph",
        text: "تسعى BotolaGO إلى ضمان توفر التطبيق دون أن تضمن اشتغاله بلا انقطاع أو بلا أخطاء. يجوز لنا تعديل الخدمة أو تعليقها أو إيقافها كلياً أو جزئياً، خاصة لأغراض الصيانة أو في حال تعليق المسابقة أو عدم توفر البيانات الرياضية.",
      },
      {
        type: "paragraph",
        text: "يجوز لنا تعديل الشروط. يُبلَّغ كل تعديل جوهري داخل التطبيق قبل 7 أيام على الأقل من سريانه. ويُعدّ استمرارك في الاستعمال بعد ذلك التاريخ قبولاً له.",
      },
      { type: "heading", text: "13. المسؤولية" },
      {
        type: "paragraph",
        text: "يُقدَّم التطبيق «كما هو». في حدود ما يسمح به القانون، لا تتحمل BotolaGO المسؤولية عن:",
      },
      {
        type: "list",
        items: [
          "الأخطاء أو التأخيرات في البيانات الرياضية المقدمة من الغير؛",
          "الخسائر غير المباشرة أو فقدان البيانات أو ضياع الفرص؛",
          "الانقطاعات الراجعة إلى الغير (المستضيف، شركات الاتصالات، متاجر التطبيقات) أو إلى قوة قاهرة؛",
          "تصرفات المستخدمين الآخرين، خاصة داخل الدوريات الخاصة.",
        ],
      },
      {
        type: "paragraph",
        text: "لا يُعفي أي بند من هذه الشروط BotolaGO من مسؤوليتها في حالة التدليس أو الخطأ الجسيم.",
      },
      { type: "heading", text: "14. إنهاء الحساب" },
      {
        type: "paragraph",
        text: "يمكنك حذف حسابك في أي وقت من إعدادات التطبيق أو بمراسلة [البريد الإلكتروني]. يجوز لـ BotolaGO تعليق أو إنهاء ولوجك، بإشعار أو بدونه حسب الخطورة، في حال مخالفة الشروط. يترتب على حذف الحساب فقدان النقاط والترتيبات والجوائز غير المُطالب بها.",
      },
      { type: "heading", text: "15. القانون الواجب التطبيق والنزاعات" },
      {
        type: "paragraph",
        text: "تخضع هذه الشروط للقانون المغربي. توجَّه كل شكاية أولاً إلى [البريد الإلكتروني]، ونرد عليها خلال 30 يوماً. وفي غياب تسوية ودية، تختص محاكم أكادير وحدها بالنظر في النزاع، مع مراعاة المقتضيات الآمرة لحماية المستهلك (القانون رقم 31-08).",
      },
      { type: "heading", text: "16. أحكام متفرقة" },
      {
        type: "paragraph",
        text: "إذا اعتُبر بند ما باطلاً، تبقى البنود الأخرى سارية. لا يُعدّ عدم تمسك BotolaGO ببند ما تنازلاً عنه. في حال وجود اختلاف بين النسخة الفرنسية والنسخة العربية، تسود النسخة الفرنسية.",
      },
    ],
  },
};

export const PRIVACY: Readonly<Record<Language, LegalDocument>> = {
  fr: {
    title: "Politique de confidentialité (FR)",
    blocks: [
      {
        type: "paragraph",
        text: "Version 1.0 — en vigueur au 21 septembre 2026. Cette politique explique quelles données BotolaGO collecte, pourquoi, avec qui elles sont partagées et quels sont vos droits, conformément à la loi n° 09-08 relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel.",
      },
      { type: "heading", text: "1. Responsable du traitement" },
      {
        type: "paragraph",
        text: "[Raison sociale], RC n° [numéro RC], ICE n° [numéro ICE], [adresse], Agadir, Maroc. Contact données personnelles : [email de contact]. Traitement déclaré à la CNDP sous le n° [numéro de récépissé CNDP].",
      },
      { type: "heading", text: "2. Données collectées" },
      {
        type: "table",
        head: ["Catégorie", "Données", "Source"],
        rows: [
          [
            "Identification du compte",
            "adresse email, pseudonyme, mot de passe (haché), identifiant de connexion sociale (Google / Apple) le cas échéant",
            "vous",
          ],
          ["Profil", "avatar, nom d'équipe, club favori, langue", "vous (facultatif)"],
          [
            "Données de jeu",
            "compositions, transferts, jetons, points, classements, ligues rejointes",
            "générées par votre utilisation",
          ],
          [
            "Données techniques",
            "modèle d'appareil, système d'exploitation, identifiant de notification push, adresse IP, journaux de connexion, version de l'Application",
            "collecte automatique",
          ],
          [
            "Usage et analyse",
            "écrans consultés, actions, fréquence d'utilisation, plantages",
            "collecte automatique (agrégée)",
          ],
          [
            "Dotations",
            "nom, prénom, copie de pièce d'identité, adresse postale, téléphone",
            "vous, uniquement si vous gagnez un lot",
          ],
          ["Support", "contenu de vos messages au support", "vous"],
        ],
      },
      {
        type: "paragraph",
        text: "Nous ne collectons ni données bancaires, ni données de géolocalisation précise, ni données sensibles (santé, opinions, religion).",
      },
      { type: "heading", text: "3. Finalités et bases légales" },
      {
        type: "table",
        head: ["Finalité", "Base légale"],
        rows: [
          [
            "Créer et gérer votre compte, faire fonctionner le jeu, calculer les points et classements",
            "exécution du contrat (CGU)",
          ],
          [
            "Vérifier votre éligibilité et remettre les lots",
            "exécution du contrat et obligation légale",
          ],
          ["Prévenir la fraude, les comptes multiples et les abus", "intérêt légitime"],
          [
            "Envoyer les notifications de jeu (deadline, résultats)",
            "exécution du contrat ; désactivables dans les paramètres",
          ],
          [
            "Envoyer des communications marketing ou offres de sponsors",
            "consentement, retirable à tout moment",
          ],
          ["Mesurer l'audience et améliorer l'Application", "intérêt légitime (données agrégées)"],
          [
            "Répondre aux demandes du support et aux obligations légales",
            "intérêt légitime et obligation légale",
          ],
        ],
      },
      { type: "heading", text: "4. Sponsors et publicité" },
      {
        type: "paragraph",
        text: "BotolaGO est financé par le sponsoring. Nous ne vendons ni ne louons vos données personnelles. Les sponsors reçoivent uniquement des statistiques agrégées et anonymisées (nombre d'utilisateurs, taux de participation, répartition par ville ou tranche d'âge). Une offre de sponsor ne vous est adressée nominativement que si vous y avez consenti.",
      },
      { type: "heading", text: "5. Destinataires et sous-traitants" },
      {
        type: "paragraph",
        text: "Vos données sont accessibles au personnel habilité de BotolaGO et aux prestataires suivants, agissant sur nos instructions et liés par contrat :",
      },
      {
        type: "table",
        head: ["Prestataire", "Rôle", "Localisation des données"],
        rows: [
          [
            "Supabase",
            "hébergement de la base de données et authentification",
            "Union européenne — Paris, France (eu-west-3)",
          ],
          [
            "Fournisseur de données sportives",
            "statistiques de match (aucune donnée personnelle transmise)",
            "—",
          ],
          [
            "Apple / Google",
            "distribution de l'Application, notifications push, connexion sociale",
            "selon leurs politiques",
          ],
          [
            "[Outil d'analyse d'audience]",
            "mesure d'usage et rapports de plantage",
            "[à préciser]",
          ],
          ["[Service d'envoi d'emails]", "emails transactionnels et marketing", "[à préciser]"],
        ],
      },
      {
        type: "paragraph",
        text: "Vos données peuvent être communiquées aux autorités marocaines sur demande légale.",
      },
      { type: "heading", text: "6. Transferts hors du Maroc" },
      {
        type: "paragraph",
        text: "Certains prestataires hébergent les données hors du Maroc. Ces transferts sont encadrés par des clauses contractuelles garantissant un niveau de protection adéquat et font l'objet de l'autorisation requise auprès de la CNDP conformément à l'article 43 de la loi 09-08.",
      },
      { type: "heading", text: "7. Durée de conservation" },
      {
        type: "table",
        head: ["Données", "Durée"],
        rows: [
          [
            "Compte et données de jeu",
            "pendant la vie du compte, puis 12 mois après suppression ou inactivité de 24 mois",
          ],
          ["Journaux techniques et IP", "12 mois"],
          [
            "Pièces justificatives des gagnants",
            "5 ans à compter de la remise du lot (obligations comptables et fiscales)",
          ],
          ["Consentement marketing", "jusqu'au retrait, puis 3 ans à titre de preuve"],
          ["Messages au support", "2 ans après clôture de la demande"],
        ],
      },
      {
        type: "paragraph",
        text: "À l'issue de ces durées, les données sont supprimées ou anonymisées. Les classements historiques peuvent être conservés sous pseudonyme.",
      },
      { type: "heading", text: "8. Vos droits" },
      {
        type: "paragraph",
        text: "Conformément à la loi 09-08, vous disposez des droits d'accès, de rectification, d'opposition et de suppression de vos données, ainsi que du droit de retirer votre consentement au marketing. Exercez-les depuis les paramètres de l'Application ou en écrivant à [email de contact] avec une copie de votre pièce d'identité. Nous répondons sous 30 jours. Vous pouvez également saisir la CNDP (www.cndp.ma).",
      },
      { type: "heading", text: "9. Sécurité" },
      {
        type: "paragraph",
        text: "Les données sont chiffrées en transit (TLS) et au repos, les mots de passe sont hachés, les accès sont restreints et journalisés. En cas de violation de données susceptible de vous porter préjudice, nous vous en informons ainsi que la CNDP dans les délais légaux.",
      },
      { type: "heading", text: "10. Mineurs" },
      {
        type: "paragraph",
        text: "L'Application est réservée aux personnes de 18 ans et plus. Nous ne collectons pas sciemment de données de mineurs ; tout compte identifié comme appartenant à un mineur est supprimé.",
      },
      { type: "heading", text: "11. Cookies et traceurs" },
      {
        type: "paragraph",
        text: "L'Application mobile n'utilise pas de cookies. Elle utilise des identifiants techniques (jeton de session, identifiant push, identifiant d'analyse) nécessaires à son fonctionnement et à la mesure d'audience. Le site web botolago.ma [à confirmer] utilise des cookies strictement nécessaires et, avec votre consentement, des cookies de mesure d'audience.",
      },
      { type: "heading", text: "12. Modifications" },
      {
        type: "paragraph",
        text: "Toute modification substantielle de cette politique est notifiée dans l'Application au moins 7 jours avant son entrée en vigueur. La version en vigueur est toujours disponible dans l'Application, rubrique « Confidentialité ».",
      },
      { type: "heading", text: "13. Contact" },
      {
        type: "paragraph",
        text: "[Raison sociale] — [adresse], Agadir, Maroc — [email de contact].",
      },
    ],
  },
  ar: {
    title: "سياسة الخصوصية (AR)",
    blocks: [
      {
        type: "paragraph",
        text: "الإصدار 1.0 — ساري المفعول ابتداءً من 21 سبتمبر 2026. تشرح هذه السياسة البيانات التي تجمعها BotolaGO، ولماذا، ومع من تُشارك، وما هي حقوقك، طبقاً للقانون رقم 09-08 المتعلق بحماية الأشخاص الذاتيين تجاه معالجة المعطيات ذات الطابع الشخصي.",
      },
      { type: "heading", text: "1. المسؤول عن المعالجة" },
      {
        type: "paragraph",
        text: "[الاسم التجاري للشركة]، السجل التجاري رقم [رقم السجل التجاري]، التعريف الموحد للمقاولة رقم [رقم ICE]، [العنوان]، أكادير، المغرب. للتواصل بخصوص المعطيات الشخصية: [البريد الإلكتروني]. المعالجة مصرّح بها لدى اللجنة الوطنية لمراقبة حماية المعطيات ذات الطابع الشخصي (CNDP) تحت رقم [رقم وصل التصريح].",
      },
      { type: "heading", text: "2. البيانات التي نجمعها" },
      {
        type: "table",
        head: ["الفئة", "البيانات", "المصدر"],
        rows: [
          [
            "تعريف الحساب",
            "البريد الإلكتروني، الاسم المستعار، كلمة المرور (مشفّرة)، معرّف تسجيل الدخول الاجتماعي (Google / Apple) عند الاقتضاء",
            "أنت",
          ],
          ["الملف الشخصي", "الصورة الرمزية، اسم الفريق، النادي المفضل، اللغة", "أنت (اختياري)"],
          [
            "بيانات اللعب",
            "التشكيلات، الانتقالات، الرقاقات، النقاط، الترتيبات، الدوريات المنضم إليها",
            "ناتجة عن استعمالك",
          ],
          [
            "البيانات التقنية",
            "طراز الجهاز، نظام التشغيل، معرّف الإشعارات، عنوان IP، سجلات الاتصال، إصدار التطبيق",
            "جمع تلقائي",
          ],
          [
            "الاستعمال والتحليل",
            "الشاشات المعروضة، الإجراءات، وتيرة الاستعمال، الأعطال",
            "جمع تلقائي (مجمّع)",
          ],
          [
            "الجوائز",
            "الاسم الكامل، نسخة من بطاقة التعريف، العنوان البريدي، رقم الهاتف",
            "أنت، فقط في حال فوزك بجائزة",
          ],
          ["الدعم", "محتوى رسائلك إلى فريق الدعم", "أنت"],
        ],
      },
      {
        type: "paragraph",
        text: "لا نجمع بيانات بنكية، ولا بيانات الموقع الجغرافي الدقيق، ولا بيانات حساسة (الصحة، الآراء، الدين).",
      },
      { type: "heading", text: "3. الأغراض والأسس القانونية" },
      {
        type: "table",
        head: ["الغرض", "الأساس القانوني"],
        rows: [
          [
            "إنشاء حسابك وإدارته، تشغيل اللعبة، احتساب النقاط والترتيبات",
            "تنفيذ العقد (شروط الاستخدام)",
          ],
          ["التحقق من أهليتك وتسليم الجوائز", "تنفيذ العقد والالتزام القانوني"],
          ["الوقاية من الغش والحسابات المتعددة والتجاوزات", "المصلحة المشروعة"],
          [
            "إرسال إشعارات اللعبة (الموعد النهائي، النتائج)",
            "تنفيذ العقد؛ يمكن تعطيلها من الإعدادات",
          ],
          ["إرسال الاتصالات التسويقية أو عروض الرعاة", "الموافقة، قابلة للسحب في أي وقت"],
          ["قياس الجمهور وتحسين التطبيق", "المصلحة المشروعة (بيانات مجمّعة)"],
          [
            "الرد على طلبات الدعم والوفاء بالالتزامات القانونية",
            "المصلحة المشروعة والالتزام القانوني",
          ],
        ],
      },
      { type: "heading", text: "4. الرعاة والإعلانات" },
      {
        type: "paragraph",
        text: "تُموَّل BotolaGO عبر الرعاية. لا نبيع بياناتك الشخصية ولا نؤجرها. يتوصل الرعاة فقط بإحصائيات مجمّعة ومجهولة الهوية (عدد المستخدمين، نسبة المشاركة، التوزيع حسب المدينة أو الفئة العمرية). لا يُوجَّه إليك عرض من راعٍ باسمك إلا إذا وافقت على ذلك.",
      },
      { type: "heading", text: "5. المتلقون والمعالجون من الباطن" },
      {
        type: "paragraph",
        text: "يمكن الاطلاع على بياناتك من طرف مستخدمي BotolaGO المخوّلين ومن طرف المزوّدين التاليين، الذين يعملون وفق تعليماتنا وبموجب عقد:",
      },
      {
        type: "table",
        head: ["المزوّد", "الدور", "مكان تخزين البيانات"],
        rows: [
          [
            "Supabase",
            "استضافة قاعدة البيانات والمصادقة",
            "الاتحاد الأوروبي — باريس، فرنسا (eu-west-3)",
          ],
          ["مزوّد البيانات الرياضية", "إحصائيات المباريات (لا تُنقل إليه أي بيانات شخصية)", "—"],
          ["Apple / Google", "توزيع التطبيق، الإشعارات، تسجيل الدخول الاجتماعي", "وفق سياساتهما"],
          ["[أداة تحليل الجمهور]", "قياس الاستعمال وتقارير الأعطال", "[يُحدد لاحقاً]"],
          ["[خدمة إرسال البريد الإلكتروني]", "الرسائل المعاملاتية والتسويقية", "[يُحدد لاحقاً]"],
        ],
      },
      { type: "paragraph", text: "قد تُبلَّغ بياناتك إلى السلطات المغربية بناءً على طلب قانوني." },
      { type: "heading", text: "6. نقل البيانات خارج المغرب" },
      {
        type: "paragraph",
        text: "يستضيف بعض المزوّدين البيانات خارج المغرب. تُؤطَّر عمليات النقل هذه ببنود تعاقدية تضمن مستوى حماية كافياً، وتخضع للإذن المطلوب من اللجنة الوطنية (CNDP) طبقاً للمادة 43 من القانون 09-08.",
      },
      { type: "heading", text: "7. مدة الاحتفاظ" },
      {
        type: "table",
        head: ["البيانات", "المدة"],
        rows: [
          [
            "الحساب وبيانات اللعب",
            "طيلة مدة الحساب، ثم 12 شهراً بعد الحذف أو بعد 24 شهراً من عدم النشاط",
          ],
          ["السجلات التقنية وعناوين IP", "12 شهراً"],
          [
            "وثائق إثبات الفائزين",
            "5 سنوات من تاريخ تسليم الجائزة (الالتزامات المحاسبية والضريبية)",
          ],
          ["الموافقة التسويقية", "حتى سحبها، ثم 3 سنوات كإثبات"],
          ["رسائل الدعم", "سنتان بعد إغلاق الطلب"],
        ],
      },
      {
        type: "paragraph",
        text: "بعد انقضاء هذه المدد، تُحذف البيانات أو تُجهَّل هويتها. يمكن الاحتفاظ بالترتيبات التاريخية باسم مستعار.",
      },
      { type: "heading", text: "8. حقوقك" },
      {
        type: "paragraph",
        text: "طبقاً للقانون 09-08، لك الحق في الولوج إلى بياناتك وتصحيحها والاعتراض على معالجتها وحذفها، وكذا الحق في سحب موافقتك على التسويق. يمكنك ممارسة هذه الحقوق من إعدادات التطبيق أو بمراسلة [البريد الإلكتروني] مرفقاً بنسخة من بطاقة تعريفك. نرد خلال 30 يوماً. كما يمكنك اللجوء إلى اللجنة الوطنية (www.cndp.ma).",
      },
      { type: "heading", text: "9. الأمن" },
      {
        type: "paragraph",
        text: "تُشفَّر البيانات أثناء النقل (TLS) وأثناء التخزين، وتُشفَّر كلمات المرور، ويُقيَّد الولوج ويُسجَّل. في حال وقوع خرق للبيانات قد يلحق بك ضرراً، نبلغك ونبلغ اللجنة الوطنية داخل الآجال القانونية.",
      },
      { type: "heading", text: "10. القاصرون" },
      {
        type: "paragraph",
        text: "التطبيق مخصص للأشخاص البالغين 18 سنة فما فوق. لا نجمع عن قصد بيانات القاصرين؛ ويُحذف كل حساب يتبين أنه يعود لقاصر.",
      },
      { type: "heading", text: "11. ملفات تعريف الارتباط وأدوات التتبع" },
      {
        type: "paragraph",
        text: "لا يستعمل التطبيق المحمول ملفات تعريف الارتباط (cookies). يستعمل معرّفات تقنية (رمز الجلسة، معرّف الإشعارات، معرّف التحليل) ضرورية لاشتغاله ولقياس الجمهور. يستعمل الموقع الإلكتروني botolago.ma [يُؤكد لاحقاً] ملفات تعريف ارتباط ضرورية فقط، وبموافقتك، ملفات لقياس الجمهور.",
      },
      { type: "heading", text: "12. التعديلات" },
      {
        type: "paragraph",
        text: "يُبلَّغ كل تعديل جوهري لهذه السياسة داخل التطبيق قبل 7 أيام على الأقل من سريانه. تبقى النسخة السارية متاحة دائماً داخل التطبيق في قسم «الخصوصية».",
      },
      { type: "heading", text: "13. للتواصل" },
      {
        type: "paragraph",
        text: "[الاسم التجاري للشركة] — [العنوان]، أكادير، المغرب — [البريد الإلكتروني].",
      },
    ],
  },
};

/** Every document, so a guard can sweep them without naming each one. */
export const LEGAL_DOCUMENTS = { terms: TERMS, privacy: PRIVACY } as const;
