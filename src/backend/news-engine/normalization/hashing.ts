// Deterministic identity for URLs, article content and story clusters.
//
// Every value here is a deduplication key. Running the same import twice must
// produce the same hashes, or the pipeline creates a second copy of a story
// that already exists.

import { createHash } from "node:crypto";

import { normalizeArticleText, normalizeEntityName } from "./text";

/** Tracking parameters that identify a referrer, never the article. */
const TRACKING_PARAMETERS = /^(utm_|fbclid$|gclid$|igshid$|mc_cid$|mc_eid$|ref$|src$)/iu;

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Canonical form of an article URL: https, lowercase host, no fragment, no
 * tracking parameters, remaining parameters sorted, no trailing slash.
 *
 * Throws for anything that is not an absolute https URL — a relative or
 * non-https link must never reach the fetch layer.
 */
export function canonicalizeArticleUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") {
    throw new Error("news_engine_non_https_url");
  }
  url.hash = "";
  url.username = "";
  url.password = "";
  url.hostname = url.hostname.toLowerCase();

  const preserved = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMETERS.test(key))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  url.search = "";
  for (const [key, parameterValue] of preserved) {
    url.searchParams.append(key, parameterValue);
  }

  let serialized = url.toString();
  if (url.pathname !== "/" && serialized.endsWith("/")) {
    serialized = serialized.slice(0, -1);
  }
  return serialized;
}

export function urlHash(value: string): string {
  return sha256Hex(canonicalizeArticleUrl(value));
}

/**
 * Fingerprints the article's substance. Title and body only: a publisher that
 * re-renders the same story under a new URL, or bumps a timestamp without
 * touching the words, is the same content.
 */
export function contentHash(input: { title?: string | null; text: string }): string {
  const title = normalizeEntityName(input.title ?? "");
  const body = normalizeArticleText(input.text).toLowerCase();
  return sha256Hex(`${title}\u001f${body}`);
}

/**
 * The deterministic identity of a real-world event.
 *
 * Built from the event type, the resolved entity ids (sorted, so mention order
 * cannot fork a cluster) and the event date. Three articles reporting one
 * signing produce one key, which is what makes "Player X joins Raja",
 * "Raja complete X signing" and "Official: Raja announce X" one story.
 *
 * When no entity resolved, the key falls back to the normalised mentions so
 * unresolved events still cluster with each other rather than each becoming a
 * separate story.
 */
export function clusterKey(input: {
  eventType: string;
  teamIds: readonly string[];
  playerIds: readonly string[];
  eventDate?: string | null;
  fallbackMentions?: readonly string[];
}): string {
  const teams = [...new Set(input.teamIds)].sort();
  const players = [...new Set(input.playerIds)].sort();
  const identity =
    teams.length + players.length > 0
      ? `${players.join(",")}|${teams.join(",")}`
      : [...new Set((input.fallbackMentions ?? []).map(normalizeEntityName).filter(Boolean))]
          .sort()
          .join(",");

  // Events without a date bucket by type and entities alone; a null date must
  // not make every mention of the same event a new cluster.
  const datePart = input.eventDate ? input.eventDate.slice(0, 10) : "undated";
  const digest = sha256Hex(`${input.eventType}\u001f${identity}\u001f${datePart}`);
  return `${input.eventType}:${digest.slice(0, 40)}`;
}
