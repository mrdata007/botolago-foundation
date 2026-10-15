import {
  articleText,
  BOTOLA_PRO_TAG,
  ELBOTOLA_API,
  type FeedItem,
} from "../elbotola-licensed-import";
import type { Candidate, Language } from "./pipeline";

const ARTICLE_URL =
  /^https:\/\/www\.elbotola\.com\/article\/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d+\.html$/u;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function boundedJson(url: string, request: typeof fetch): Promise<Record<string, unknown>> {
  const response = await request(url, {
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
    headers: {
      accept: "application/json",
      "user-agent": "BotolaGO-AINews/1.0 (+https://botolago.com)",
    },
  });
  if (!response.ok) throw new Error(`elbotola_http_${response.status}`);
  const body = await response.text();
  if (body.length > 500_000) throw new Error("elbotola_response_too_large");
  const result: unknown = JSON.parse(body);
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("invalid_elbotola_response");
  return result as Record<string, unknown>;
}

export async function gatherElbotola(
  language: Language,
  now: Date,
  request = fetch,
): Promise<Candidate[]> {
  const feed = await boundedJson(
    `${ELBOTOLA_API}/newsfeed/v3/?lang=${language}&content_type=article&tag_id=${BOTOLA_PRO_TAG}&page_size=10&page=1`,
    request,
  );
  if (!Array.isArray(feed.results)) throw new Error("invalid_elbotola_feed");
  const candidates: Candidate[] = [];
  for (const item of (feed.results as FeedItem[]).slice(0, 10)) {
    if (
      typeof item.object_id !== "string" ||
      !/^\d+$/u.test(item.object_id) ||
      typeof item.absolute_url !== "string" ||
      !ARTICLE_URL.test(item.absolute_url) ||
      typeof item.pub_date !== "number"
    )
      continue;
    if (now.getTime() - item.pub_date * 1000 > 72 * 3_600_000) continue;
    const detail = await boundedJson(`${ELBOTOLA_API}/articles/${item.object_id}/`, request);
    if (typeof detail.title !== "string" || typeof detail.html_content !== "string") continue;
    const paragraphs = articleText(detail.html_content)
      .filter((line) => line.length >= 25)
      .slice(0, 8);
    candidates.push({
      sourceId: `elbotola:${item.object_id}`,
      url: item.absolute_url,
      outlet: "ElBotola",
      publishedAt: new Date(item.pub_date * 1000).toISOString(),
      retrievedAt: new Date().toISOString(),
      language,
      title: detail.title,
      sourceText: paragraphs.join(" "),
      competition: "botola-pro-inwi",
      facts: paragraphs.map((text, index) => ({
        id: `f${index + 1}`,
        text,
        sourceUrl: item.absolute_url,
        outlet: "ElBotola",
      })),
    });
    await pause(500);
  }
  return candidates;
}
