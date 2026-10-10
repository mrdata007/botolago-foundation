/**
 * AI-written Botola Pro 1 content (migration 20261003150000_ai_content_generation).
 *
 * Woken by pg_cron through pg_net with the scheduler token. Each run:
 *   1. asks the database what is worth writing (api.service_ai_content_plan),
 *      which also enforces the on/off switch and the daily cap;
 *   2. has the model write French and Arabic from the supplied FACTS only;
 *   3. rejects anything that fails the checks below -- the article is simply
 *      not published and the same job comes back next run;
 *   4. publishes through api.service_ai_content_publish (cap and switch are
 *      enforced again inside the database);
 *   5. emails the owner about every article not yet notified.
 *
 * The model never writes HTML. It returns plain paragraphs and this file
 * escapes them and builds the markup, so a model cannot inject a script, a
 * link or an image. Source links come from the database, not the model.
 */
import {
  EmailDispatchError,
  emailDispatchConfiguration,
  type EmailRpcClient,
} from "./notification-email-dispatch.ts";
import { containsPublicAiNotice, PUBLIC_EDITORIAL_RULE } from "./public-editorial-policy.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_MODEL = "gpt-4o";
const MAX_JOBS_PER_RUN = 3;
const SANITIZER_VERSION = "ai-content-v1";

export type ContentKind = "match_preview" | "match_recap" | "news_report" | "blog";
export type ContentLanguage = "fr" | "ar";
const LANGUAGES: readonly ContentLanguage[] = ["fr", "ar"];

interface NewsItem {
  readonly editionId: string;
  readonly title: string;
  readonly excerpt: string;
  readonly sourceName: string;
  readonly sourceUrl: string;
}

export interface ContentJob {
  readonly kind: ContentKind;
  readonly fixtureId: string | null;
  readonly facts?: Record<string, unknown>;
  readonly news?: readonly NewsItem[];
  readonly recentResults?: readonly Record<string, unknown>[];
}

interface LanguageText {
  readonly title: string;
  readonly summary: string;
  readonly paragraphs: readonly string[];
}
export type GeneratedArticle = Record<ContentLanguage, LanguageText>;

export interface AiContentDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: EmailRpcClient;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly randomHex?: () => string;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------- prompting

const SYSTEM_PROMPT = [
  "You write for BotolaGO, a Moroccan football website about the Botola Pro 1.",
  "Write ONLY from the facts supplied in the user message. Never add a score,",
  "scorer, minute, injury, quote, transfer, table position or statistic that is",
  "not in the facts. If a detail is not supplied, leave it out. Do not guess.",
  "For news and blog pieces, put every claim in your own words and credit the",
  "outlet by name when you rely on it; never copy sentences from an excerpt.",
  "Write any score as digits with a hyphen, like 2-1, never in words.",
  "Write in clear, neutral, engaging journalistic prose. Plain text only: no",
  "markdown, no HTML, no lists, no emoji.",
  PUBLIC_EDITORIAL_RULE,
  "Reply with a single JSON object and nothing else, in this exact shape:",
  '{"fr":{"title":"","summary":"","paragraphs":[""]},"ar":{"title":"","summary":"","paragraphs":[""]}}',
  "fr is French and ar is Modern Standard Arabic; they report the same facts.",
  "title: 20-120 characters. summary: 60-300 characters. paragraphs: 3 to 6,",
  "each 200-700 characters.",
].join(" ");

const KIND_BRIEF: Record<ContentKind, string> = {
  match_preview:
    "Write a match preview. Use the kickoff time, the two teams and, where useful, each side's last results as supplied. Do not predict an exact score.",
  match_recap:
    "Write a match report on the finished game using the final score, the half-time score and any penalty shoot-out score as supplied, and nothing else about how the game went.",
  news_report:
    "Write one news roundup of the Botola Pro 1 that reports what the supplied stories say, crediting each outlet by name.",
  blog: "Write an opinion-style blog post for fans about the current Botola Pro 1 picture, grounded only in the supplied stories and results. Make clear it is commentary.",
};

export function buildUserMessage(job: ContentJob): string {
  const payload: Record<string, unknown> = {};
  if (job.facts) payload.facts = job.facts;
  if (job.news) {
    payload.stories = job.news.map(({ title, excerpt, sourceName }) => ({
      outlet: sourceName,
      headline: title,
      excerpt,
    }));
  }
  if (job.recentResults) payload.recentResults = job.recentResults;
  return `${KIND_BRIEF[job.kind]}\n\nFACTS (JSON):\n${JSON.stringify(payload)}`;
}

// ------------------------------------------------------------ model reply

function readLanguageText(value: unknown): LanguageText | null {
  if (!isRecord(value)) return null;
  const { title, summary, paragraphs } = value;
  if (typeof title !== "string" || typeof summary !== "string" || !Array.isArray(paragraphs)) {
    return null;
  }
  if (!paragraphs.every((p) => typeof p === "string")) return null;
  const cleanTitle = title.trim();
  const cleanSummary = summary.trim();
  const cleanParagraphs = (paragraphs as string[]).map((p) => p.trim()).filter(Boolean);
  if (cleanTitle.length < 5 || cleanTitle.length > 160) return null;
  if (cleanSummary.length < 30 || cleanSummary.length > 400) return null;
  if (cleanParagraphs.length < 3 || cleanParagraphs.length > 8) return null;
  if (cleanParagraphs.some((p) => p.length < 80 || p.length > 1500)) return null;
  if ([cleanTitle, cleanSummary, ...cleanParagraphs].some(containsPublicAiNotice)) return null;
  return { title: cleanTitle, summary: cleanSummary, paragraphs: cleanParagraphs };
}

/** Pull the JSON object out of the model's reply and check its shape. */
export function parseGenerated(raw: string): GeneratedArticle | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const fr = readLanguageText(parsed.fr);
  const ar = readLanguageText(parsed.ar);
  return fr && ar ? { fr, ar } : null;
}

// ------------------------------------------------------------ fact checks

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
function westernDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)));
}

function collectScorePairs(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectScorePairs(item, into);
    return;
  }
  if (!isRecord(value)) return;
  const pairs: [string, string][] = [
    ["homeScore", "awayScore"],
    ["halfTimeHome", "halfTimeAway"],
    ["penaltyHome", "penaltyAway"],
    ["scored", "conceded"],
    ["home_score", "away_score"],
  ];
  for (const [a, b] of pairs) {
    const left = value[a];
    const right = value[b];
    if (typeof left === "number" && typeof right === "number") {
      into.add(`${left}-${right}`);
      into.add(`${right}-${left}`);
    }
  }
  for (const child of Object.values(value)) collectScorePairs(child, into);
}

const NUMBER_WORDS: readonly (readonly [string, number])[] = [
  // French
  ["zéro", 0],
  ["zero", 0],
  ["une", 1],
  ["un", 1],
  ["deux", 2],
  ["trois", 3],
  ["quatre", 4],
  ["cinq", 5],
  ["six", 6],
  ["sept", 7],
  ["huit", 8],
  ["neuf", 9],
  // Arabic
  ["صفر", 0],
  ["واحد", 1],
  ["اثنان", 2],
  ["اثنين", 2],
  ["ثلاثة", 3],
  ["ثلاث", 3],
  ["أربعة", 4],
  ["اربعة", 4],
  ["أربع", 4],
  ["خمسة", 5],
  ["خمس", 5],
  ["ستة", 6],
  ["سبعة", 7],
  ["ثمانية", 8],
  ["تسعة", 9],
];

/** Digits in either script, and spelled-out 0-9 in French and Arabic, as plain 0-9. */
function normalizeScoreText(text: string): string {
  let out = westernDigits(text).toLowerCase();
  for (const [word, value] of NUMBER_WORDS) {
    out = out.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, "gu"),
      String(value),
    );
  }
  return out;
}

// "3-0", "3 – 0", "3 à 0", "٣ مقابل ٠", "3 إلى 0", and "3:0" (a single-digit
// second number, so clock times such as 20:00 or 9:05 are never read as scores).
const SCORE_PATTERNS: readonly RegExp[] = [
  /(?<![\d:/.-])(\d{1,2})(?:\s*[-–—]\s*|\s+(?:à|مقابل|إلى|الى)\s+)(\d{1,2})(?![\d:/.-])/gu,
  /(?<![\d:/.-])(\d{1,2})\s*:\s*(\d)(?![\d:])/gu,
];

/**
 * Every score written in the text must be one in the supplied facts, in either
 * order. Scores are recognised however they are written (digits, French "à",
 * Arabic "مقابل", colons, spelled-out numbers). This does not prove the
 * article is true; it stops the most embarrassing failure -- an invented
 * scoreline -- from reaching the site.
 */
export function inventedScores(job: ContentJob, article: GeneratedArticle): string[] {
  const allowed = new Set<string>();
  collectScorePairs(job.facts, allowed);
  collectScorePairs(job.recentResults, allowed);
  // A news roundup or blog may repeat a score that the supplied stories state.
  const sourceText = normalizeScoreText(
    (job.news ?? []).map((item) => `${item.title}\n${item.excerpt}`).join("\n"),
  );
  for (const pattern of SCORE_PATTERNS) {
    for (const match of sourceText.matchAll(pattern)) {
      allowed.add(`${match[1]}-${match[2]}`);
      allowed.add(`${match[2]}-${match[1]}`);
    }
  }
  const found = new Set<string>();
  for (const language of LANGUAGES) {
    const { title, summary, paragraphs } = article[language];
    const text = normalizeScoreText([title, summary, ...paragraphs].join("\n"));
    for (const pattern of SCORE_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        const pair = `${match[1]}-${match[2]}`;
        if (!allowed.has(pair)) found.add(pair);
      }
    }
  }
  return [...found];
}

// ---------------------------------------------------------------- HTML

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SOURCES_LABEL: Record<ContentLanguage, string> = { fr: "Sources", ar: "المصادر" };

export function renderBodyHtml(
  language: ContentLanguage,
  text: LanguageText,
  news: readonly NewsItem[] | undefined,
): string {
  const parts = text.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`);
  const sources = (news ?? []).filter((item) => /^https:\/\/[^\s"'<>]+$/.test(item.sourceUrl));
  if (sources.length > 0) {
    const seen = new Set<string>();
    const items = sources
      .filter((item) => (seen.has(item.sourceUrl) ? false : (seen.add(item.sourceUrl), true)))
      .map(
        (item) =>
          `<li><a href="${escapeHtml(item.sourceUrl)}" rel="noopener noreferrer nofollow" target="_blank">${escapeHtml(item.sourceName)}</a></li>`,
      );
    parts.push(`<p><strong>${SOURCES_LABEL[language]}</strong></p><ul>${items.join("")}</ul>`);
  }
  return parts.join("");
}

function readingTimeMinutes(html: string): number {
  const words = html
    .replace(/<[^>]*>/g, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
  return Math.min(60, Math.max(1, Math.ceil(words / 220)));
}

// ----------------------------------------------------------- OpenAI call

async function askModel(
  job: ContentJob,
  config: { apiKey: string; model: string },
  fetchImpl: typeof fetch,
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(OPENAI_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4000,
        temperature: 0.7,
        // The system prompt already asks for a single JSON object; JSON mode
        // makes the reply reliably parseable. Needs a JSON-mode-capable model
        // (gpt-4o / gpt-4.1 family); parseGenerated still guards the shape.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(job) },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------- owner email

interface Notice {
  readonly id: string;
  readonly kind: string;
  readonly language: string;
  readonly title: string;
  readonly slug: string;
  readonly model: string;
}

export function renderOwnerEmail(
  notices: readonly Notice[],
  appUrl: string,
): { subject: string; text: string } {
  const lines = notices.map(
    (n) =>
      `- [${n.kind} / ${n.language.toUpperCase()}] ${n.title}\n  ${appUrl}/news/${encodeURIComponent(n.slug)}`,
  );
  const subject =
    notices.length === 1
      ? `[BotolaGO AI] Published: ${notices[0].title.replace(/[\r\n]+/g, " ").slice(0, 120)}`
      : `[BotolaGO AI] ${notices.length} articles published`;
  const text = [
    "BotolaGO's AI just published:",
    "",
    ...lines,
    "",
    "To pause publishing right now, run in the database:",
    "  select app_private.ai_content_configure(false);",
    "To take one article down, unpublish it from the admin news screen.",
  ].join("\n");
  return { subject, text };
}

async function emailOwner(
  deps: AiContentDependencies,
  notices: readonly Notice[],
): Promise<boolean> {
  if (notices.length === 0) return true;
  let config: ReturnType<typeof emailDispatchConfiguration>;
  try {
    config = emailDispatchConfiguration(deps.environment);
  } catch (error) {
    if (error instanceof EmailDispatchError) return false;
    throw error;
  }
  const target = await deps.client.schema("api").rpc("service_ops_alert_email_target", {});
  if (target.error || typeof target.data !== "string") return false;
  const { subject, text } = renderOwnerEmail(notices, config.appUrl);
  try {
    const response = await (deps.fetchImpl ?? fetch)(RESEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [target.data],
        reply_to: config.replyTo,
        subject,
        text,
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the request

async function rpc(client: EmailRpcClient, name: string, args: Record<string, unknown> = {}) {
  const result = await client.schema("api").rpc(name, args);
  if (result.error) {
    const error = new Error(result.error.message ?? "rpc_failed");
    (error as Error & { code?: string }).code = result.error.code;
    throw error;
  }
  return result.data;
}

function slugFor(kind: ContentKind, language: ContentLanguage, now: Date, random: string): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `ai-${kind.replace(/_/g, "-")}-${language}-${day}-${random}`;
}

export async function handleAiContentRequest(
  request: Request,
  deps: AiContentDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const token = request.headers.get("x-botolago-scheduler-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json(401, { error: "unauthorized" });
  try {
    const verified = await rpc(deps.client, "service_verify_scheduler_token", { p_token: token });
    if (verified !== true) return json(401, { error: "unauthorized" });
  } catch {
    return json(503, { error: "database_unavailable" });
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  const randomHex =
    deps.randomHex ??
    (() =>
      Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""));
  const summary = { published: 0, rejected: 0, failed: 0, notified: 0 };

  // Owed emails first: a pause or an earlier failure never hides a live article.
  const notifyPending = async () => {
    try {
      const pending = (await rpc(deps.client, "service_ai_content_pending_notices")) as Notice[];
      if (!Array.isArray(pending) || pending.length === 0) return;
      const ok = await emailOwner(deps, pending);
      await rpc(deps.client, "service_ai_content_record_notice", {
        p_ids: pending.map((n) => n.id),
        p_sent: ok,
      });
      if (ok) summary.notified += pending.length;
    } catch {
      summary.failed += 1;
    }
  };

  const apiKey = deps.environment.OPENAI_KEY?.trim() ?? "";
  const model = deps.environment.AI_CONTENT_MODEL?.trim() || DEFAULT_MODEL;

  let plan: { enabled?: boolean; jobs?: ContentJob[] };
  try {
    plan = (await rpc(deps.client, "service_ai_content_plan")) as typeof plan;
  } catch {
    await notifyPending();
    return json(503, { error: "database_unavailable", ...summary });
  }
  if (!plan?.enabled || !Array.isArray(plan.jobs) || plan.jobs.length === 0) {
    await notifyPending();
    return json(200, { idle: true, ...summary });
  }
  if (apiKey.length < 20) {
    await notifyPending();
    return json(503, { error: "ai_provider_not_configured", ...summary });
  }

  for (const job of plan.jobs.slice(0, MAX_JOBS_PER_RUN)) {
    const raw = await askModel(job, { apiKey, model }, fetchImpl);
    const article = raw ? parseGenerated(raw) : null;
    if (!article || inventedScores(job, article).length > 0) {
      summary.rejected += 1;
      continue;
    }
    const sourceIds = (job.news ?? []).map((item) => item.editionId);
    try {
      const editions = LANGUAGES.map((language) => {
        const html = renderBodyHtml(language, article[language], job.news);
        return {
          language,
          slug: slugFor(job.kind, language, now(), randomHex()),
          title: article[language].title,
          summary: article[language].summary,
          bodyHtml: html,
          readingTimeMinutes: readingTimeMinutes(html),
        };
      });
      // One call, one transaction: both languages go live together or not at all.
      await rpc(deps.client, "service_ai_content_publish", {
        p_kind: job.kind,
        p_fixture_id: job.fixtureId,
        p_editions: editions,
        p_source_edition_ids: sourceIds,
        p_model: model,
        p_sanitizer_version: SANITIZER_VERSION,
      });
      summary.published += 1;
    } catch (error) {
      summary.failed += 1;
      // Cap reached or switched off mid-run: stop, the rest wait for tomorrow.
      const code = (error as { code?: string }).code;
      if (code === "53400" || code === "42501") break;
    }
  }

  await notifyPending();
  return json(200, summary);
}
