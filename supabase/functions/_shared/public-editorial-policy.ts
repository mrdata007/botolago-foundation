/** Owner's public editorial rule. Provider/model provenance stays in private audit records. */
export const PUBLIC_EDITORIAL_RULE =
  'Never add AI authorship or generation notices to public articles or images, including titles, summaries, body text, captions, credits, badges, watermarks and alt text. Do not write "AI-generated", "AI-assisted", "written with artificial intelligence" or equivalents in French, Arabic or any other language. Do not add OpenAI, ChatGPT or other AI provider/model credits. Keep factual source attribution.';

const norm = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/\p{M}|ـ/gu, "")
    .replace(/[’‘`´]/g, "'");

const W = "[\\p{L}\\p{N}]";
const START = `(?<!${W})`;
const END = `(?!${W})`;
/** Words between a credit verb and the AI term, within one clause. */
const GAP = '(?:[^\\s.!?؟;:,،()«»"]+\\s+){0,5}?';

/** Generic AI wording. `AI`/`IA` are matched case-sensitively afterwards, so "j'ai" is safe. */
const GENERIC = [
  "AI",
  "A\\.I\\.",
  "IA",
  "intelligence\\s+artificielle",
  "artificial\\s+intelligence",
  "generative\\s+AI",
  "machine\\s+learning",
  "apprentissage\\s+automatique",
  "[وبلفك]?(?:ال)?ذكاء\\s+(?:ال)?اصطناعي",
  "[وبلفك]?(?:ال)?ذكاء\\s+(?:ال)?صناعي",
];
/** Names that are an AI credit wherever they appear. */
const UNAMBIGUOUS = [
  "Open\\s?AI",
  "ChatGPT",
  "GPT-?\\d[\\w.-]*",
  "DALL[-·\\s]?E\\s?\\d*",
  "Midjourney",
  "Stable\\s+Diffusion",
  "Anthropic",
  "أوبن\\s+إيه\\s+آي",
  "اوبن\\s+اي\\s+اي",
  "(?:تشات|شات)\\s*جي\\s*بي\\s*تي",
  "ميدجورني",
];
/** Names that are also people, places, winds or products: only a credit context makes them AI. */
const AMBIGUOUS = [
  "Gemini",
  "Claude",
  "Mistral(?:\\s+AI)?",
  "Llama\\s?\\d*",
  "Copilot",
  "Grok",
  "Bard",
  "Sora",
  "Firefly",
  "Flux",
  "Qwen",
  "DeepSeek",
  "Perplexity",
  "Ideogram",
  "Runway",
  "Kling",
  "Veo",
  "Imagen",
  "Gemma",
  "Cohere",
  "GPT",
  "LLM",
  "Meta\\s+AI",
  "Bing\\s+Chat",
  "جيميني",
  "كلود",
  "ميسترال",
  "غروك",
  "كوبايلوت",
];

const T_GENERIC = `(?<t>${GENERIC.join("|")})`;
const T_ANY = `(?<t>${[...GENERIC, ...UNAMBIGUOUS, ...AMBIGUOUS].join("|")})`;
const T_NAME = `(?<t>${[...UNAMBIGUOUS, ...AMBIGUOUS].join("|")})`;

const VERBS = [
  // French
  "redig",
  "ecri[ts]",
  "genere",
  "cree",
  "produi[ts]",
  "illustre",
  "realise",
  "elabore",
  "concu",
  "traduit",
  "assiste",
  "aide",
  "alimente",
  "propulse",
  "fabrique",
  "imagine",
  "compose",
  "signe",
  "utilis",
  "assistance",
  // English
  "generated",
  "written",
  "created",
  "produced",
  "made",
  "drafted",
  "illustrated",
  "authored",
  "composed",
  "translated",
  "edited",
  "assisted",
  "powered",
  "enhanced",
  "crafted",
  "rendered",
  "designed",
  "built",
  "supported",
  "aided",
  "using",
  "used",
  // Arabic (normalised: no vowel marks, hamza folded)
  "كتب",
  "كتابة",
  "انش",
  "ولد",
  "توليد",
  "تولد",
  "مولد",
  "انتج",
  "انتاج",
  "صمم",
  "تصميم",
  "رسم",
  "اعد",
  "تحرير",
  "ترجم",
  "صنع",
  "بمساعدة",
  "بواسطة",
  "باستخدام",
];
const VERB = `${START}(?:${VERBS.join("|")})${W}*`;

const CONNECT = [
  "avec",
  "par",
  "via",
  "grace\\s+a",
  "a\\s+l'aide\\s+d\\S*",
  "en\\s+utilisant",
  "utilisant",
  "by",
  "with",
  "using",
  "through",
  "thanks\\s+to",
  "(?:help|aid|assistance)\\s+of",
  "بواسطة",
  "باستخدام",
  "بمساعدة",
  "بدعم\\s+من",
  "مدعوم\\s+من",
  "مدعومة\\s+من",
  "عبر",
  "من\\s+خلال",
  "بتقنية",
  "بتقنيات",
  "بفضل",
].join("|");
const ARTICLE = "(?:(?:l'|la\\s+|le\\s+|les\\s+|un\\s+|une\\s+|an?\\s+|the\\s+)\\s*)?";
const NOUN = [
  "illustration",
  "image",
  "visuel",
  "photo",
  "article",
  "texte",
  "contenu",
  "resume",
  "traduction",
  "video",
  "picture",
  "artwork",
  "content",
  "text",
  "summary",
  "translation",
  "صورة",
  "صور",
  "مقال",
  "محتوى",
  "نص",
  "ملخص",
  "ترجمة",
  "فيديو",
  "رسم",
  "تصميم",
  "توضيحية",
].join("|");
const LABEL = [
  "credits?",
  "source",
  "image",
  "illustration",
  "photo",
  "visuel",
  "visual",
  "picture",
  "artwork",
  "auteur",
  "author",
  "©",
  "الصورة",
  "صورة",
  "المصدر",
  "مصدر",
  "حقوق",
  "تصميم",
  "اعداد",
].join("|");

const PATTERNS: RegExp[] = [
  // "rédigé par GPT-4", "created with DALL-E", "généré par Mistral", "تم إنشاؤه بواسطة ..."
  `${VERB}\\s+${GAP}(?:\\p{L}{1,2}')?${T_ANY}${END}`,
  // "avec l'IA", "powered by AI", "بالذكاء الاصطناعي" (generic terms only: a bare preposition proves nothing for names)
  `${START}(?:${CONNECT})\\s+${ARTICLE}${T_GENERIC}${END}`,
  `${START}[وف]?ب(?:ال)?ذكاء\\s+(?:ال)?(?:اصطناعي|صناعي)`,
  // "Illustration IA :", "image AI", "مقال بالذكاء الاصطناعي"
  `${START}(?:${NOUN})\\s+(?:d')?${GAP.replace("{0,5}", "{0,1}")}${T_GENERIC}${END}`,
  // "AI-generated", "IA générative", "AI-assisted"
  `(?<t>AI|IA)[\\s-]+(?:generat|assist|writ|creat|produc|made|power|author|illustrat|translat|draft|enhanc|edit|driven|based|redig|cree|produit)\\w*`,
  `(?<t>IA)\\s+generative`,
  // Credit lines: "Crédit : Midjourney", "© OpenAI", "BotolaGO · Gemini"
  `${START}(?:${LABEL})\\s*(?::|·|•|\\||–|—|\\s-\\s)?\\s*(?:BotolaGO\\s*[·•|–—/]\\s*)?${T_NAME}${END}`,
  `[·•|–—]\\s*${T_NAME}\\s*$`,
  // "Claude a rédigé cet article", "ChatGPT wrote this text"
  `${T_NAME}\\s+(?:a|ont|has|have)\\s+(?:redige|ecrit|genere|cree|produit|illustre|written|generated|created|produced|drafted)\\w*\\s+(?:cet|ce|cette|ces|this|these|the)\\s`,
  `${T_NAME}\\s+(?:wrote|drafted)\\s+(?:this|these|the)\\s`,
].map((source) => new RegExp(source, "giu"));

const NAME_PATTERN = new RegExp(`^(?:${UNAMBIGUOUS.join("|")})$`, "iu");

function isAiTerm(term: string, after: string): boolean {
  const bare = term.trim();
  // "ai" and "ia" are ordinary words in French ("j'ai"); only the capitalised acronym counts.
  if (/^(?:ai|ia)$/i.test(bare)) return bare === bare.toUpperCase();
  // "Claude Le Roy", "Claude Puel": a capitalised word after the first name is a surname.
  if (/^claude$/i.test(bare)) {
    return !/^\s+\p{Lu}/u.test(after) || /^\s+(?:AI|IA|Opus|Sonnet|Haiku|Code|\d)/u.test(after);
  }
  return true;
}

/** Fail closed if the article model ignores the public editorial rule. */
export function containsPublicAiNotice(text: string): boolean {
  const normalized = norm(text);
  // Names that only ever mean an AI product are rejected wherever they appear.
  for (const m of normalized.matchAll(
    new RegExp(UNAMBIGUOUS.map((u) => `${START}${u}${END}`).join("|"), "giu"),
  )) {
    if (NAME_PATTERN.test(m[0].trim())) return true;
  }
  for (const pattern of PATTERNS) {
    pattern.lastIndex = 0;
    for (const m of normalized.matchAll(pattern)) {
      const term = m.groups?.t ?? "";
      const end = (m.index ?? 0) + m[0].length;
      if (isAiTerm(term, normalized.slice(end))) return true;
    }
  }
  return false;
}
