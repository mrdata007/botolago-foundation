/** Owner's public editorial rule. Provider/model provenance stays in private audit records. */
export const PUBLIC_EDITORIAL_RULE =
  'Never add AI authorship or generation notices to public articles or images, including titles, summaries, body text, captions, credits, badges, watermarks and alt text. Do not write "AI-generated", "AI-assisted", "written with artificial intelligence" or equivalents in French, Arabic or any other language. Do not add OpenAI, ChatGPT or other AI provider/model credits. Keep factual source attribution.';

/** Fail closed if the article model ignores the public editorial rule. */
export function containsPublicAiNotice(text: string): boolean {
  const normalized = text.normalize("NFKD").replace(/\p{M}|ـ/gu, "");
  return /\b(?:ai|ia|openai|chatgpt|anthropic|claude|gemini)\b|intelligence\s+artificielle|artificial\s+intelligence|الذكاء\s+الاصطناعي/iu.test(
    normalized,
  );
}
