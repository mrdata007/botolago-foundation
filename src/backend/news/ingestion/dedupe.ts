import { createHash } from "node:crypto";
import type { NormalizedNewsArticle } from "../provider/contracts";

export function canonicalizeNewsUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  url.searchParams.sort();
  return url.toString();
}

export function newsContentFingerprint(article: NormalizedNewsArticle): string {
  const stable = [
    article.language,
    article.title.normalize("NFKC").trim().toLowerCase(),
    article.summary.normalize("NFKC").trim().toLowerCase(),
    article.bodyHtml.replace(/\s+/gu, " ").trim(),
  ].join("\u001f");
  return createHash("sha256").update(stable).digest("hex");
}
