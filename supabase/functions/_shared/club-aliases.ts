/**
 * Known alternative names for Botola Pro clubs, used only to CHECK generated
 * articles (ai-content.ts), never to write them. The facts handed to the model
 * carry one name per club and language (api.service_ai_content_plan); a report
 * that names the same club another way ("RCA Zemamra" for "Renaissance Club
 * Athletic Zemamra") reads as two clubs, so the article is rejected.
 *
 * Seeded from the production club catalog (demo/src/data/catalog.json: names
 * and short names), the club slugs, and the provider fixtures. Add an alias
 * when an article or an audit shows a new variant. Keep each alias specific to
 * one club: no bare three-letter codes such as "RCA", and no bare Arabic words
 * that are also ordinary words ("الجيش" army, "الفتح" conquest, "الرجاء" hope).
 */
export interface ClubAliasGroup {
  readonly key: string;
  readonly fr: readonly string[];
  readonly ar: readonly string[];
}

export const CLUB_ALIASES: readonly ClubAliasGroup[] = [
  {
    key: "amal-tiznit",
    fr: ["Amal Tiznit", "Amal Sportif de Tiznit"],
    ar: ["أمل تيزنيت"],
  },
  {
    key: "codm-meknes",
    fr: ["CODM Meknès", "CODM Meknes", "Club Olympique de Meknès"],
    ar: ["النادي المكناسي"],
  },
  {
    key: "difaa-el-jadida",
    fr: ["Difaâ El Jadida", "Difaa El Jadida", "Difaâ Hassani d'El Jadida"],
    ar: ["الدفاع الحسني الجديدي", "الدفاع الجديدي"],
  },
  {
    key: "far-rabat",
    fr: ["FAR Rabat", "AS FAR", "Association Sportive des FAR", "Club des FAR"],
    ar: ["الجيش الملكي"],
  },
  {
    key: "fus-rabat",
    fr: ["FUS Rabat", "Fath Union Sport", "Fath Union Sport de Rabat"],
    ar: ["الفتح الرياضي", "الفتح الرباطي"],
  },
  {
    key: "hassania-agadir",
    fr: ["Hassania Agadir", "Hassania Union Sport d'Agadir", "HUSA Agadir"],
    ar: ["حسنية أكادير"],
  },
  {
    key: "ittihad-tanger",
    fr: ["Ittihad Tanger", "IR Tanger", "Ittihad Riadi de Tanger"],
    ar: ["اتحاد طنجة"],
  },
  {
    key: "kawkab-marrakech",
    fr: ["Kawkab Marrakech", "KAC Marrakech", "Kawkab Athletic Club de Marrakech"],
    ar: ["الكوكب المراكشي"],
  },
  {
    key: "maghreb-fes",
    fr: ["Maghreb Fès", "Maghreb de Fès", "Maghreb Fez", "Maghrib Athletic de Fès", "MAS Fès"],
    ar: ["نادي المغرب الرياضي الفاسي", "المغرب الفاسي"],
  },
  {
    key: "moghreb-tetouan",
    fr: ["Moghreb Tétouan", "Moghreb Tetouan", "Moghreb Athletic de Tétouan", "MAT Tétouan"],
    ar: ["نادي المغرب أتلتيك تطوان", "المغرب التطواني"],
  },
  {
    key: "raja-casablanca",
    fr: ["Raja Casablanca", "Raja Club Athletic", "Raja CA", "Raja de Casablanca"],
    ar: ["الرجاء الرياضي", "الرجاء البيضاوي"],
  },
  {
    key: "rca-zemamra",
    fr: [
      "Renaissance Club Athletic Zemamra",
      "RCA Zemamra",
      "CR Khemis Zemamra",
      "Renaissance Zemamra",
      "Renaissance de Zemamra",
      "Renaissance Athletic Zemamra",
    ],
    ar: ["نادي النهضة أتلتيك الزمامرة", "نهضة الزمامرة", "النهضة الزمامرية"],
  },
  {
    key: "rsb-berkane",
    fr: ["RSB Berkane", "RS Berkane", "Renaissance Sportive de Berkane", "Renaissance de Berkane"],
    ar: ["نهضة بركان", "النهضة البركانية"],
  },
  {
    key: "uts-rabat",
    fr: ["UTS Rabat", "Union Touarga Sport", "Union Touarga Sport de Rabat", "US Touarga"],
    ar: ["اتحاد تواركة"],
  },
  {
    key: "widad-temara",
    fr: ["Widad Témara", "Widad Temara", "Widad Athletic de Témara", "Widad de Témara"],
    ar: ["نادي الوداد الرياضي لتمارة", "وداد تمارة"],
  },
  {
    key: "wydad-casablanca",
    fr: ["Wydad Casablanca", "Wydad Athletic Club", "Wydad AC", "Wydad de Casablanca"],
    ar: ["الوداد الرياضي", "الوداد البيضاوي"],
  },
];
