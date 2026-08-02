export interface MediaLocation {
  readonly sourceUrl?: string | null;
  readonly storagePath?: string | null;
}

const STORAGE_BUCKETS = {
  football: "football-media",
  news: "news-media",
} as const;

function configuredSupabaseUrl(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}

function validatedSourceUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function validatedSupabaseOrigin(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    const localHttp =
      url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) return undefined;
    if (url.pathname !== "/" || url.search || url.hash) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function storageTarget(storagePath: string | null | undefined) {
  if (!storagePath || storagePath !== storagePath.trim() || storagePath.includes("\\")) {
    return undefined;
  }

  const segments = storagePath.split("/");
  const namespace = segments[0] as keyof typeof STORAGE_BUCKETS | undefined;
  if (
    !namespace ||
    !(namespace in STORAGE_BUCKETS) ||
    segments.length < 2 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return undefined;
  }

  return {
    bucket: STORAGE_BUCKETS[namespace],
    path: segments.map((segment) => encodeURIComponent(segment)).join("/"),
  };
}

/** Resolve validated editorial/provider media without requiring a Supabase client or API key. */
export function resolveMediaUrl(
  media: MediaLocation | null | undefined,
  supabaseUrl: string | null | undefined = configuredSupabaseUrl(),
): string | undefined {
  const sourceUrl = validatedSourceUrl(media?.sourceUrl);
  if (sourceUrl) return sourceUrl;

  const target = storageTarget(media?.storagePath);
  const origin = validatedSupabaseOrigin(supabaseUrl);
  if (!target || !origin) return undefined;

  return `${origin}/storage/v1/object/public/${target.bucket}/${target.path}`;
}
