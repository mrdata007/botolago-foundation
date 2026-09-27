import { describe, expect, it } from "bun:test";

import {
  handlePlayerPhotoUploadRequest,
  sniffUploadType,
  type RpcResult,
  type StorageClient,
  type UserScopedClient,
} from "./player-photo-upload";

const PLAYER = "11111111-1111-4111-8111-111111111111";
const INTAKE = `players/${PLAYER}/22222222-2222-4222-8222-222222222222.jpg`;
const DOCUMENT = `players/${PLAYER}/release-abc.pdf`;

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PDF = new TextEncoder().encode("%PDF-1.7 release");

function storage() {
  const uploaded: Array<{ bucket: string; path: string; contentType: string }> = [];
  const removed: Array<{ bucket: string; path: string }> = [];
  const client: StorageClient = {
    from: (bucket) => ({
      upload: async (path, _body, options) => {
        uploaded.push({ bucket, path, contentType: options.contentType });
        return { error: null };
      },
      remove: async (paths) => {
        removed.push(...paths.map((path) => ({ bucket, path })));
        return { error: null };
      },
    }),
  };
  return { client, uploaded, removed };
}

function user(results: { paths?: RpcResult; submit?: RpcResult }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client: UserScopedClient = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "staff", role: "authenticated" } },
        error: null,
      }),
    },
    schema: () => ({
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === "admin_player_photo_upload_paths") {
          return (
            results.paths ?? { data: { intakePath: INTAKE, documentPath: DOCUMENT }, error: null }
          );
        }
        return (
          results.submit ?? { data: { releaseId: "release-1", status: "pending" }, error: null }
        );
      },
    }),
  };
  return { client, calls };
}

function request(parts: { photo?: Uint8Array; document?: Uint8Array; playerId?: string } = {}) {
  const form = new FormData();
  form.set("playerId", parts.playerId ?? PLAYER);
  form.set("photo", new Blob([parts.photo ?? JPEG], { type: "image/jpeg" }), "photo.jpg");
  form.set(
    "document",
    new Blob([parts.document ?? PDF], { type: "application/pdf" }),
    "release.pdf",
  );
  form.set("capturedOn", "2026-09-01");
  form.set("signedOn", "2026-09-02");
  form.set("signerRole", "player");
  form.set("scope", "in_app_and_social");
  form.set("licenceCode", "botolago_release");
  form.set("credit", "BotolaGO");
  form.set("copyrightOwner", "BotolaGO");
  return new Request("https://example.test/functions/v1/player-photo-upload", {
    method: "POST",
    headers: { authorization: "Bearer staff-token" },
    body: form,
  });
}

describe("sniffUploadType", () => {
  it("reads the bytes, not the declared type", () => {
    expect(sniffUploadType(JPEG)).toBe("image/jpeg");
    expect(sniffUploadType(PDF)).toBe("application/pdf");
    expect(sniffUploadType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});

describe("handlePlayerPhotoUploadRequest", () => {
  it("asks for the paths as the caller, stores both files privately, then records the release", async () => {
    const files = storage();
    const caller = user({});
    const response = await handlePlayerPhotoUploadRequest(request(), {
      serviceClient: files.client,
      createUserClient: () => caller.client,
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ releaseId: "release-1", status: "pending" });
    expect(caller.calls.map((call) => call.name)).toEqual([
      "admin_player_photo_upload_paths",
      "admin_player_photo_submit",
    ]);
    expect(caller.calls[0]!.args).toEqual({
      p_player_id: PLAYER,
      p_photo_extension: "jpg",
      p_document_extension: "pdf",
    });
    expect(files.uploaded).toEqual([
      { bucket: "player-photo-intake", path: INTAKE, contentType: "image/jpeg" },
      { bucket: "player-photo-releases", path: DOCUMENT, contentType: "application/pdf" },
    ]);
    expect(caller.calls[1]!.args).toMatchObject({
      p_player_id: PLAYER,
      p_intake_path: INTAKE,
      p_release: { documentPath: DOCUMENT, scope: "in_app_and_social", capturedOn: "2026-09-01" },
    });
  });

  it("stores nothing when the database refuses the caller", async () => {
    const files = storage();
    const caller = user({
      paths: { data: null, error: { code: "42501", message: "admin_permission_denied" } },
    });
    const response = await handlePlayerPhotoUploadRequest(request(), {
      serviceClient: files.client,
      createUserClient: () => caller.client,
    });
    expect(response.status).toBe(403);
    expect(files.uploaded).toEqual([]);
  });

  it("removes both files when the release is refused", async () => {
    const files = storage();
    const caller = user({
      submit: { data: null, error: { code: "22023", message: "PHOTO_RELEASE_INVALID" } },
    });
    const response = await handlePlayerPhotoUploadRequest(request(), {
      serviceClient: files.client,
      createUserClient: () => caller.client,
    });
    expect(response.status).toBe(422);
    expect(files.removed).toEqual([
      { bucket: "player-photo-intake", path: INTAKE },
      { bucket: "player-photo-releases", path: DOCUMENT },
    ]);
  });

  it("refuses a photo that is not an image and a caller without a token", async () => {
    const files = storage();
    const caller = user({});
    const notImage = await handlePlayerPhotoUploadRequest(
      request({ photo: new TextEncoder().encode("<html>") }),
      { serviceClient: files.client, createUserClient: () => caller.client },
    );
    expect(notImage.status).toBe(415);
    const anonymous = await handlePlayerPhotoUploadRequest(
      new Request("https://example.test/", { method: "POST" }),
      { serviceClient: files.client, createUserClient: () => caller.client },
    );
    expect(anonymous.status).toBe(401);
    expect(files.uploaded).toEqual([]);
    expect(caller.calls).toEqual([]);
  });
});
