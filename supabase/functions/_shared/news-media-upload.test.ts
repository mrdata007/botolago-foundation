import { describe, expect, it } from "bun:test";
import {
  handleNewsMediaUploadRequest,
  MAX_MEDIA_UPLOAD_BYTES,
  newsMediaStoragePath,
  sniffImageMimeType,
  type NewsMediaUploadDependencies,
  type RpcResult,
  type StorageClient,
  type UserScopedClient,
} from "./news-media-upload";

/** Where the fixed test upload (`randomId`, `now` below) is stored. */
const STORED_PATH = "news/2026/09/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";

function storageClient(uploadError: { message?: string } | null = null): {
  client: StorageClient;
  uploaded: Array<{ path: string; contentType: string; cacheControl: string }>;
  removed: string[];
} {
  const uploaded: Array<{ path: string; contentType: string; cacheControl: string }> = [];
  const removed: string[] = [];
  const client: StorageClient = {
    from: () => ({
      upload: async (path, _body, options) => {
        uploaded.push({
          path,
          contentType: options.contentType,
          cacheControl: options.cacheControl,
        });
        return { error: uploadError };
      },
      remove: async (paths) => {
        removed.push(...paths);
        return { error: null };
      },
    }),
  };
  return { client, uploaded, removed };
}

/** A staff context that satisfies the pre-upload editorial gate. */
const EDITOR_STAFF_CONTEXT: RpcResult = {
  data: { accessAllowed: true, permissions: ["editorial.read", "editorial.write"] },
  error: null,
};

/** What `api.get_my_staff_context()` does for an account with no staff principal. */
const NON_STAFF_CONTEXT: RpcResult = {
  data: null,
  error: { message: "staff_access_denied", code: "PT403" },
};

function userClient(options: {
  userId?: string | null;
  role?: string;
  rpcResult?: RpcResult;
  staffContext?: RpcResult;
  calls?: Array<{ name: string; args: Record<string, unknown> }>;
}): UserScopedClient {
  return {
    auth: {
      getUser: async () =>
        options.userId
          ? {
              data: { user: { id: options.userId, role: options.role ?? "authenticated" } },
              error: null,
            }
          : { data: { user: null }, error: { message: "no session" } },
    },
    schema: () => ({
      rpc: async (name, args) => {
        options.calls?.push({ name, args });
        if (name === "get_my_staff_context") {
          return options.staffContext ?? EDITOR_STAFF_CONTEXT;
        }
        return (
          options.rpcResult ?? {
            data: { mediaAssetId: "11111111-1111-4111-8111-111111111111" },
            error: null,
          }
        );
      },
    }),
  };
}

function registerCalls(calls: Array<{ name: string; args: Record<string, unknown> }>) {
  return calls.filter((call) => call.name === "editorial_register_media");
}

function multipartRequest(fields: Record<string, string | Blob>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value instanceof Blob) {
      // Bun's multipart encoder infers the part's Content-Type from the
      // filename extension, not from Blob.type, so mirror it here.
      const ext = value.type.split("/")[1] ?? "bin";
      form.append(key, value, `upload.${ext}`);
    } else {
      form.append(key, value);
    }
  }
  return new Request("https://example.test/news-media-upload", {
    method: "POST",
    headers: { authorization: "Bearer test-jwt" },
    body: form,
  });
}

function deps(
  overrides: Partial<NewsMediaUploadDependencies> = {},
  storage = storageClient(),
  user = userClient({ userId: "22222222-2222-4222-8222-222222222222" }),
): NewsMediaUploadDependencies {
  return {
    supabaseUrl: "https://project.supabase.test",
    serviceClient: storage.client,
    createUserClient: () => user,
    randomId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    now: () => new Date("2026-09-23T12:00:00Z"),
    ...overrides,
  };
}

/** A JPEG signature (SOI + APP0) -- the handler checks the bytes, not only the label. */
const validImage = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])], {
  type: "image/jpeg",
});

describe("handleNewsMediaUploadRequest", () => {
  it("answers a CORS preflight without ever requiring a bearer token", async () => {
    const response = await handleNewsMediaUploadRequest(
      new Request("https://example.test/news-media-upload", { method: "OPTIONS" }),
      deps(),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("rejects a request with no bearer token", async () => {
    const response = await handleNewsMediaUploadRequest(
      new Request("https://example.test/news-media-upload", { method: "POST" }),
      deps(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects an anonymous caller", async () => {
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: validImage, altText: "Alt", width: "800", height: "600" }),
      deps({}, storageClient(), userClient({ userId: null })),
    );
    expect(response.status).toBe(401);
  });

  it("rejects an unsupported mime type before touching storage", async () => {
    const storage = storageClient();
    const gif = new Blob([new Uint8Array([1])], { type: "image/gif" });
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: gif, altText: "Alt", width: "800", height: "600" }),
      deps({}, storage),
    );
    expect(response.status).toBe(415);
    expect(storage.uploaded).toHaveLength(0);
  });

  it("rejects a file over the size limit before touching storage", async () => {
    const storage = storageClient();
    const big = new Blob([new Uint8Array(MAX_MEDIA_UPLOAD_BYTES + 1)], { type: "image/jpeg" });
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: big, altText: "Alt", width: "800", height: "600" }),
      deps({}, storage),
    );
    expect(response.status).toBe(413);
    expect(storage.uploaded).toHaveLength(0);
  });

  it("requires alt text and dimensions", async () => {
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: validImage, width: "800", height: "600" }),
      deps(),
    );
    expect(response.status).toBe(400);
  });

  it("uploads then registers the media asset as the calling user, returning a public url", async () => {
    const storage = storageClient();
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({
        file: validImage,
        altText: "Une photo du derby",
        width: "1200",
        height: "630",
      }),
      deps({}, storage, userClient({ userId: "user-1", calls })),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      mediaAssetId: string;
      storagePath: string;
      publicUrl: string;
    };
    expect(body.storagePath).toBe(STORED_PATH);
    expect(body.publicUrl).toBe(
      `https://project.supabase.test/storage/v1/object/public/news-media/${STORED_PATH}`,
    );
    // A year of caching is safe only because the name is new and never reused.
    expect(storage.uploaded).toEqual([
      { path: STORED_PATH, contentType: "image/jpeg", cacheControl: "31536000" },
    ]);
    expect(registerCalls(calls)[0]?.args.p_storage_path).toBe(STORED_PATH);
    expect(registerCalls(calls)).toHaveLength(1);
    expect(registerCalls(calls)[0]?.args.p_alt_text).toBe("Une photo du derby");
  });

  it("refuses a signed-in caller with no staff principal before any byte is stored", async () => {
    const storage = storageClient();
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: validImage, altText: "Alt", width: "800", height: "600" }),
      deps({}, storage, userClient({ userId: "user-1", staffContext: NON_STAFF_CONTEXT, calls })),
    );
    expect(response.status).toBe(403);
    expect(storage.uploaded).toHaveLength(0);
    expect(storage.removed).toHaveLength(0);
    expect(registerCalls(calls)).toHaveLength(0);
  });

  it("refuses staff who hold no editorial write permission", async () => {
    const storage = storageClient();
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: validImage, altText: "Alt", width: "800", height: "600" }),
      deps(
        {},
        storage,
        userClient({
          userId: "user-1",
          staffContext: {
            data: { accessAllowed: true, permissions: ["security.read_audit"] },
            error: null,
          },
        }),
      ),
    );
    expect(response.status).toBe(403);
    expect(storage.uploaded).toHaveLength(0);
  });

  it("refuses an editor whose session has not reached aal2", async () => {
    const storage = storageClient();
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: validImage, altText: "Alt", width: "800", height: "600" }),
      deps(
        {},
        storage,
        userClient({
          userId: "user-1",
          staffContext: {
            data: { accessAllowed: false, permissions: ["editorial.write"] },
            error: null,
          },
        }),
      ),
    );
    expect(response.status).toBe(403);
    expect(storage.uploaded).toHaveLength(0);
  });

  it("deletes the uploaded object and surfaces the forbidden error when registration is refused", async () => {
    const storage = storageClient();
    const forbiddenUser = userClient({
      userId: "user-1",
      rpcResult: { data: null, error: { message: "news_editorial_forbidden", code: "42501" } },
    });
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: validImage, altText: "Alt", width: "800", height: "600" }),
      deps({}, storage, forbiddenUser),
    );
    expect(response.status).toBe(403);
    expect(storage.removed).toEqual([STORED_PATH]);
  });

  it("returns 502 and never registers when the storage upload itself fails", async () => {
    const storage = storageClient({ message: "bucket unavailable" });
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: validImage, altText: "Alt", width: "800", height: "600" }),
      deps({}, storage, userClient({ userId: "user-1", calls })),
    );
    expect(response.status).toBe(502);
    expect(registerCalls(calls)).toHaveLength(0);
  });
});

describe("where an upload is stored", () => {
  it("files it under its upload year and month, in UTC", () => {
    expect(newsMediaStoragePath("id", "webp", new Date("2027-01-05T08:00:00Z"))).toBe(
      "news/2027/01/id.webp",
    );
    // Half past midnight on 1 January at UTC+1 is still December in UTC.
    expect(newsMediaStoragePath("id", "jpg", new Date("2027-01-01T00:30:00+01:00"))).toBe(
      "news/2026/12/id.jpg",
    );
  });

  it("produces a path the database's storage_path check accepts", () => {
    // The CHECK on app.media_assets.storage_path and editorial_register_media.
    const databaseRule = /^(football|news)\/[a-z0-9/_-]+[.](avif|jpg|jpeg|png|webp)$/;
    expect(databaseRule.test(STORED_PATH)).toBe(true);
  });
});

describe("the file's bytes must match its declared image type", () => {
  const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const webp = new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]);
  const avif = new Uint8Array([0, 0, 0, 0x1c, ...ascii("ftypavif"), 0, 0, 0, 0]);
  const html = new Uint8Array(ascii("<!doctype html><script>alert(1)</script>"));
  const svg = new Uint8Array(ascii('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'));

  it("recognises each accepted format from its signature", () => {
    expect(sniffImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe("image/jpeg");
    expect(sniffImageMimeType(png)).toBe("image/png");
    expect(sniffImageMimeType(webp)).toBe("image/webp");
    expect(sniffImageMimeType(avif)).toBe("image/avif");
  });

  it("recognises nothing else, including truncated signatures", () => {
    expect(sniffImageMimeType(html)).toBeNull();
    expect(sniffImageMimeType(svg)).toBeNull();
    expect(sniffImageMimeType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMimeType(new Uint8Array([]))).toBeNull();
  });

  for (const [label, bytes, declared] of [
    ["an HTML page labelled image/png", html, "image/png"],
    ["an SVG labelled image/webp", svg, "image/webp"],
    ["a PNG labelled image/jpeg", png, "image/jpeg"],
  ] as const) {
    it(`refuses ${label} before anything is stored or registered`, async () => {
      const storage = storageClient();
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const user = userClient({ userId: "22222222-2222-4222-8222-222222222222", calls });
      const response = await handleNewsMediaUploadRequest(
        multipartRequest({
          file: new Blob([bytes], { type: declared }),
          altText: "Alt",
          width: "800",
          height: "600",
        }),
        deps({}, storage, user),
      );
      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({ error: "content_type_mismatch" });
      expect(storage.uploaded).toHaveLength(0);
      expect(registerCalls(calls)).toHaveLength(0);
    });
  }

  it("accepts a real PNG labelled image/png", async () => {
    const storage = storageClient();
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({
        file: new Blob([png], { type: "image/png" }),
        altText: "Alt",
        width: "800",
        height: "600",
      }),
      deps({}, storage),
    );
    expect(response.status).toBe(201);
    expect(storage.uploaded[0]?.contentType).toBe("image/png");
  });
});
