export function canonicalVisualSource(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) throw Error("draft_invalid_source");
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw Error("draft_invalid_source");
  const host = url.hostname.replace(/^www\./, "");
  if (host === "instagram.com") {
    if (!/^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) throw Error("draft_invalid_source");
    url.pathname = url.pathname.replace(/\/?$/, "/");
  } else if (host !== "elbotola.com" || url.pathname === "/") throw Error("draft_invalid_source");
  url.hostname = host;
  url.search = "";
  url.hash = "";
  return url.href;
}
