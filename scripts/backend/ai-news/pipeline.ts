import { createHash } from "node:crypto";
import { sanitizeEditorialHtml, NEWS_SANITIZER_VERSION } from "../../../src/backend/news/sanitizer";

export type Language = "ar" | "fr";
export interface Fact {
  id: string;
  text: string;
  sourceUrl: string;
  outlet: string;
}
export interface Candidate {
  sourceId: string;
  url: string;
  outlet: string;
  publishedAt: string;
  retrievedAt: string;
  language: Language;
  title: string;
  sourceText: string;
  facts: Fact[];
  competition: "botola-pro-inwi";
}
export interface Paragraph {
  text: string;
  factIds: string[];
}
export interface GeneratedArticle {
  headline: string;
  lead: Paragraph;
  body: Paragraph[];
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
}
export interface Draft {
  key: string;
  candidate: Candidate;
  article: GeneratedArticle;
  html: string;
  sanitizerVersion: string;
  model: string;
  quality: "passed" | "review_required";
  reasons: string[];
}
export interface ExistingStory {
  sourceId: string;
  url: string;
  title: string;
  publishedAt: string;
}
export interface Writer {
  model: string;
  generate(
    language: Language,
    facts: readonly Fact[],
    source: { outlet: string; url: string },
  ): Promise<GeneratedArticle>;
  verify(article: GeneratedArticle, facts: readonly Fact[]): Promise<boolean>;
}
export interface Store {
  existing(): Promise<ExistingStory[]>;
  pendingAutoPublication(): Promise<string[]>;
  saveDraft(draft: Draft): Promise<"created" | "existing">;
  publish(key: string): Promise<void>;
}
export interface PipelineOptions {
  dailyLimit: number;
  maximumAgeHours: number;
  automaticPublication: boolean;
  dryRun: boolean;
  now: Date;
}

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const tokens = (value: string) =>
  new Set(
    normalize(value)
      .split(/\s+/u)
      .filter((word) => word.length > 2),
  );
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const escapeHtml = (value: string) =>
  value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");

export function titleSimilarity(left: string, right: string): number {
  const a = tokens(left),
    b = tokens(right);
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / new Set([...a, ...b]).size;
}

export function selectCandidates(
  candidates: readonly Candidate[],
  existing: readonly ExistingStory[],
  options: PipelineOptions,
): Candidate[] {
  if (!Number.isInteger(options.dailyLimit) || options.dailyLimit < 0 || options.dailyLimit > 20)
    throw new Error("invalid_daily_limit");
  if (options.dailyLimit === 0) return [];
  const selected: Candidate[] = [];
  const known = [...existing];
  for (const item of [...candidates].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    if (item.competition !== "botola-pro-inwi" || !/^https:\/\//u.test(item.url)) continue;
    const age = options.now.getTime() - Date.parse(item.publishedAt);
    if (!Number.isFinite(age) || age < -300_000 || age > options.maximumAgeHours * 3_600_000)
      continue;
    if (
      known.some(
        (story) =>
          story.sourceId === item.sourceId ||
          story.url === item.url ||
          titleSimilarity(story.title, item.title) >= 0.82,
      )
    )
      continue;
    if (
      item.facts.length < 2 ||
      item.facts.some(
        (fact) => !/^https:\/\//u.test(fact.sourceUrl) || !fact.text.trim() || !fact.outlet.trim(),
      )
    )
      continue;
    selected.push(item);
    known.push({
      sourceId: item.sourceId,
      url: item.url,
      title: item.title,
      publishedAt: item.publishedAt,
    });
    if (selected.length >= options.dailyLimit) break;
  }
  return selected;
}

function numbers(value: string): string[] {
  return normalize(value).match(/\p{N}+/gu) ?? [];
}
function ngrams(value: string): string[] {
  const words = normalize(value).split(/\s+/u).filter(Boolean);
  return words.flatMap((_, index) =>
    index + 7 <= words.length ? [words.slice(index, index + 7).join(" ")] : [],
  );
}

export function validateArticle(candidate: Candidate, article: GeneratedArticle): string[] {
  const reasons: string[] = [];
  const paragraphs = [article.lead, ...article.body];
  const factById = new Map(candidate.facts.map((fact) => [fact.id, fact]));
  if (
    article.headline.trim().length < 12 ||
    article.headline.length > 220 ||
    article.excerpt.trim().length < 20 ||
    article.excerpt.length > 300 ||
    article.body.length < 2
  )
    reasons.push("incomplete_article");
  if (
    !article.seoTitle.trim() ||
    article.seoTitle.length > 70 ||
    !article.seoDescription.trim() ||
    article.seoDescription.length > 170
  )
    reasons.push("invalid_seo");
  const text = [
    article.headline,
    article.excerpt,
    article.seoTitle,
    article.seoDescription,
    ...paragraphs.map((p) => p.text),
  ].join(" ");
  if (/[«»“”"„]/u.test(text)) reasons.push("unattributed_quote");
  if (/<[^>]+>/u.test(text)) reasons.push("model_html");
  const evidenceNumbers = new Set(numbers(candidate.facts.map((fact) => fact.text).join(" ")));
  if (numbers(text).some((number) => !evidenceNumbers.has(number)))
    reasons.push("unsupported_number_or_date");
  for (const paragraph of paragraphs) {
    if (
      paragraph.text.trim().length < 20 ||
      !paragraph.factIds.length ||
      paragraph.factIds.some((id) => !factById.has(id))
    )
      reasons.push("unsupported_paragraph");
    if (candidate.language === "ar" && !/[\u0600-\u06ff]/u.test(paragraph.text))
      reasons.push("wrong_language");
    if (candidate.language === "fr" && /[\u0600-\u06ff]/u.test(paragraph.text))
      reasons.push("wrong_language");
  }
  const sourceGrams = new Set(ngrams(candidate.sourceText));
  if (ngrams(text).some((gram) => sourceGrams.has(gram)))
    reasons.push("near_duplicate_source_text");
  return [...new Set(reasons)];
}

export function renderArticle(candidate: Candidate, article: GeneratedArticle): string {
  const paragraphs = [article.lead, ...article.body];
  const html = paragraphs
    .map((paragraph) => {
      const links = [
        ...new Map(
          paragraph.factIds
            .map((id) => candidate.facts.find((fact) => fact.id === id))
            .filter((fact): fact is Fact => Boolean(fact))
            .map((fact) => [fact.sourceUrl, fact.outlet]),
        ).entries(),
      ];
      return `<p>${escapeHtml(paragraph.text)} ${links.map(([url, outlet]) => `<a href="${escapeHtml(url)}">${escapeHtml(outlet)}</a>`).join(" ")}</p>`;
    })
    .join("");
  return sanitizeEditorialHtml(html);
}

export async function runPipeline(
  candidates: readonly Candidate[],
  store: Store,
  writer: Writer,
  options: PipelineOptions,
): Promise<{
  drafted: number;
  existing: number;
  held: number;
  heldDrafts: number;
  updatesHeld: number;
  published: number;
  dryRun: boolean;
}> {
  if (!Number.isInteger(options.dailyLimit) || options.dailyLimit < 0 || options.dailyLimit > 20)
    throw new Error("invalid_daily_limit");
  const existing = await store.existing();
  // Try later candidates if an earlier one fails the quality gate.
  const selected = selectCandidates(candidates, existing, { ...options, dailyLimit: 20 });
  const updatesHeld = candidates.filter((item) =>
    existing.some(
      (story) =>
        story.sourceId === item.sourceId &&
        (story.title !== item.title ||
          Date.parse(item.publishedAt) > Date.parse(story.publishedAt)),
    ),
  ).length;
  const result = {
    drafted: 0,
    existing: 0,
    held: 0,
    heldDrafts: 0,
    updatesHeld,
    published: 0,
    dryRun: options.dryRun,
  };
  if (options.automaticPublication && !options.dryRun && options.dailyLimit > 0) {
    for (const key of await store.pendingAutoPublication()) {
      if (result.published >= options.dailyLimit) break;
      await store.publish(key);
      result.published += 1;
    }
  }
  for (const candidate of selected) {
    if (result.drafted + result.heldDrafts >= options.dailyLimit || options.dailyLimit === 0) break;
    const article = await writer.generate(candidate.language, candidate.facts, {
      outlet: candidate.outlet,
      url: candidate.url,
    });
    const reasons = validateArticle(candidate, article);
    if (!reasons.length && !(await writer.verify(article, candidate.facts)))
      reasons.push("model_fact_check_failed");
    if (reasons.length) result.held += 1;
    if (reasons.length && (reasons.length !== 1 || reasons[0] !== "model_fact_check_failed"))
      continue;
    const draft: Draft = {
      key: digest(`ai-news-v1:${candidate.sourceId}:${candidate.language}`),
      candidate,
      article,
      html: renderArticle(candidate, article),
      sanitizerVersion: NEWS_SANITIZER_VERSION,
      model: writer.model,
      quality: reasons.length ? "review_required" : "passed",
      reasons,
    };
    if (options.dryRun) {
      if (reasons.length) result.heldDrafts += 1;
      else result.drafted += 1;
      continue;
    }
    const status = await store.saveDraft(draft);
    if (status === "existing") {
      result.existing += 1;
      continue;
    }
    if (reasons.length) {
      result.heldDrafts += 1;
      continue;
    }
    result.drafted += 1;
    // One outlet's uncorroborated account is useful for a draft, not unattended publication.
    if (
      options.automaticPublication &&
      result.published < options.dailyLimit &&
      new Set(candidate.facts.map((fact) => fact.outlet)).size >= 2
    ) {
      await store.publish(draft.key);
      result.published += 1;
    }
  }
  return result;
}
