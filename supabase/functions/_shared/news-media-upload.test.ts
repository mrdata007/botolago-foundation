import { describe, expect, it } from "bun:test";
import {
  handleNewsMediaUploadRequest,
  MAX_MEDIA_UPLOAD_BYTES,
  type NewsMediaUploadDependencies,
  type RpcResult,
  type StorageClient,
  type UserScopedClient,
} from "./news-media-upload";

function storageClient(uploadError: { message?: string } | null = null): {
  client: StorageClient;
  uploaded: Array<{ path: string; contentType: string }>;
  removed: string[];
} {
  const uploaded: Array<{ path: string; contentType: string }> = [];
  const removed: string[] = [];
  const client: StorageClient = {
    from: () => ({
      upload: async (path, _body, options) => {
        uploaded.push({ path, contentType: options.contentType });
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

function userClient(options: {
  userId?: string | null;
  role?: string;
  rpcResult?: RpcResult;
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
    ...overrides,
  };
}

const validImage = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });

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
    expect(body.storagePath).toBe("news/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg");
    expect(body.publicUrl).toBe(
      "https://project.supabase.test/storage/v1/object/public/news-media/news/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg",
    );
    expect(storage.uploaded).toEqual([
      { path: "news/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg", contentType: "image/jpeg" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("editorial_register_media");
    expect(calls[0]?.args.p_alt_text).toBe("Une photo du derby");
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
    expect(storage.removed).toEqual(["news/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg"]);
  });

  it("returns 502 and never registers when the storage upload itself fails", async () => {
    const storage = storageClient({ message: "bucket unavailable" });
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleNewsMediaUploadRequest(
      multipartRequest({ file: validImage, altText: "Alt", width: "800", height: "600" }),
      deps({}, storage, userClient({ userId: "user-1", calls })),
    );
    expect(response.status).toBe(502);
    expect(calls).toHaveLength(0);
  });
});
