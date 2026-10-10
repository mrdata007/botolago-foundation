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
const T_NO_AMBIGUOUS = `(?<t>${[...GENERIC, ...UNAMBIGUOUS].join("|")})`;
/** Empty marker group: the match sits in a proven credit context, so lowercase `ai`/`ia` count. */
const PROVEN = "(?<p>)";

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

/** Real generation verbs. "signé"/"signed" is a transfer, not a generation, so it is absent. */
const GEN_VERBS = [
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
  "alimente",
  "propulse",
  "fabrique",
  "compose",
  "dessine",
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
  "drawn",
  "painted",
  "كتب",
  "كتابة",
  "انش",
  "ولد",
  "توليد",
  "تولد",
  "انتج",
  "انتاج",
  "صمم",
  "تصميم",
  "رسم",
  "اعد",
  "ترجم",
  "صنع",
];
const GEN_VERB = `${START}(?:${GEN_VERBS.join("|")})${W}*`;
/** The preposition that must directly follow a generation verb to make a credit. */
const CREDIT_PREP = [
  "avec",
  "par",
  "via",
  "by",
  "with",
  "using",
  "en\\s+utilisant",
  "grace\\s+a",
  "بواسطة",
  "باستخدام",
  "بمساعدة",
  "عبر",
].join("|");
const HELP_OF = "(?:(?:l'aide|the\\s+help|help|the\\s+aid|assistance)\\s+(?:of|de|d')\\s*)?";

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

const SUBJECT_VERBS = [
  "redig\\w*",
  "ecri\\w*",
  "genere\\w*",
  "cree\\w*",
  "produi\\w*",
  "illustre\\w*",
  "realise\\w*",
  "elabore\\w*",
  "concu\\w*",
  "traduit\\w*",
  "compos\\w*",
  "dessin\\w*",
  "fabriqu\\w*",
  "wrote",
  "written",
  "writes?",
  "draft\\w*",
  "generat\\w*",
  "creat\\w*",
  "produc\\w*",
  "illustrat\\w*",
  "authored",
  "translat\\w*",
  "made",
  "designed",
  "drew",
  "drawn",
  "painted",
  "rendered",
  "crafted",
  "كتب\\w*",
  "انش\\w*",
  "ولد\\w*",
  "انتج\\w*",
  "صمم\\w*",
  "رسم\\w*",
  "اعد\\w*",
  "ترجم\\w*",
  "صنع\\w*",
  "حرر\\w*",
].join("|");
const AUX =
  "(?:a|as|ont|has|have|had|avait|also|just|then|aussi|egalement|deja|already|vient|de|ete|been)";
const DET = "(?:cet|ce|cette|ces|this|these|that|the|هذا|هذه|هذان|ذلك|تلك)";
const AR_SUBJECT_VERBS = "(?:كتب|انش|ولد|انتج|صمم|رسم|اعد|ترجم|صنع|حرر)";
const LABEL_SEP = "(?::|·|•|\\||–|—|\\s-\\s)";
const BOTOLAGO = "(?:BotolaGO\\s*[·•|–—/]\\s*)?";

const PATTERNS: RegExp[] = [
  // "rédigé par l'IA", "created with DALL-E": generic and unambiguous terms after a verb within the clause
  `${VERB}\\s+${GAP}(?:\\p{L}{1,2}')?${T_NO_AMBIGUOUS}${END}`,
  // Proven credit syntax: a generation verb directly followed by par/by/avec/with/via/using/بواسطة and the term.
  // Names that are also people or places are only ever credited this way; lowercase ai/ia count here too.
  `${GEN_VERB}\\s+(?:${CREDIT_PREP})\\s+${HELP_OF}${ARTICLE}${PROVEN}${T_ANY}${END}`,
  // "avec l'IA", "powered by AI", "بالذكاء الاصطناعي" (generic terms only: a bare preposition proves nothing for names)
  `${START}(?:${CONNECT})\\s+${ARTICLE}${T_GENERIC}${END}`,
  `${START}[وف]?ب(?:ال)?ذكاء\\s+(?:ال)?(?:اصطناعي|صناعي)`,
  // "Illustration IA :", "image AI", "مقال بالذكاء الاصطناعي"
  `${START}(?:${NOUN})\\s+(?:d')?${GAP.replace("{0,5}", "{0,1}")}${T_GENERIC}${END}`,
  // "AI-generated", "IA générative", "AI-assisted"
  `(?<t>AI|IA)[\\s-]+(?:generat|assist|writ|creat|produc|made|power|author|illustrat|translat|draft|enhanc|edit|driven|based|redig|cree|produit)\\w*`,
  `(?<t>IA)\\s+generative`,
  // Credit lines with an explicit separator: "Crédit : Midjourney", "Image : ia", "BotolaGO · Gemini"
  `${START}(?:${LABEL.replace("|©", "")})\\s*${LABEL_SEP}\\s*${BOTOLAGO}${PROVEN}${T_ANY}${END}`,
  `©\\s*${BOTOLAGO}${PROVEN}${T_ANY}${END}`,
  `[·•|–—]\\s*${T_NAME}\\s*$`,
  // Subject-first: "Claude a rédigé cet article", "L'IA a écrit ce texte", "Artificial intelligence wrote this article"
  `${START}${T_ANY}\\s+(?:${AUX}\\s+){0,3}(?:${SUBJECT_VERBS})\\s+${DET}${END}`,
  // Arabic verb-first: "كتب الذكاء الاصطناعي هذا المقال"
  `${START}${AR_SUBJECT_VERBS}${W}*\\s+${T_ANY}\\s+${DET}${END}`,
].map((source) => new RegExp(source, "giud"));

const NAME_PATTERN = new RegExp(`^(?:${UNAMBIGUOUS.join("|")})$`, "iu");

function isAiTerm(term: string, after: string, proven: boolean): boolean {
  const bare = term.trim();
  // "ai" and "ia" are ordinary words in French ("j'ai"); outside a proven credit context
  // only the capitalised acronym counts.
  if (/^(?:ai|ia)$/i.test(bare)) return proven || bare === bare.toUpperCase();
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
      // Text right after the term itself (not the whole match) decides the "Claude Le Roy" surname case.
      const termEnd = m.indices?.groups?.t?.[1] ?? (m.index ?? 0) + m[0].length;
      if (isAiTerm(term, normalized.slice(termEnd), m.groups?.p !== undefined)) return true;
    }
  }
  return false;
}
