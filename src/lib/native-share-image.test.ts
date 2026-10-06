import { describe, expect, test } from "bun:test";

import {
  ANDROID_ALBUM,
  baseName,
  blobToBase64,
  loadFilesystem,
  loadMedia,
  loadShare,
  nativeImageActions,
  saveImageToGallery,
  shareImageFile,
  type SaveDeps,
  type ShareDeps,
} from "./native-share-image";

const PNG = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff])], {
  type: "image/png",
});
const PNG_BASE64 = "iVBORw0KGgr/";

type Call = { method: string; options: unknown };

function rejection(message: string, code?: string) {
  return Object.assign(new Error(message), code ? { code } : {});
}

function media(
  calls: Call[],
  {
    savePhoto,
    createAlbum,
  }: { savePhoto?: () => Promise<unknown>; createAlbum?: () => Promise<void> } = {},
) {
  return async () => ({
    getAlbumsPath: async () => {
      calls.push({ method: "getAlbumsPath", options: undefined });
      return { path: "/storage/emulated/0/Android/media/botolago.com/" };
    },
    createAlbum: async (options: unknown) => {
      calls.push({ method: "createAlbum", options });
      if (createAlbum) await createAlbum();
    },
    savePhoto: async (options: unknown) => {
      calls.push({ method: "savePhoto", options });
      if (savePhoto) await savePhoto();
      return { filePath: "x" };
    },
  });
}

describe("the plugin loaders", () => {
  test("settle with plain objects, never with Capacitor's plugin proxy itself", async () => {
    // Resolving a promise with the proxy calls `proxy.then`, which Capacitor
    // turns into a plugin call that is never answered: the promise hangs. The
    // real plugins are loaded here (Capacitor's web platform under bun).
    const timeout = new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 1000));
    for (const load of [loadMedia, loadShare, loadFilesystem]) {
      const loaded = await Promise.race([load(), timeout]);
      expect(loaded).not.toBe("hung");
      expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
      expect("then" in (loaded as object)).toBe(false);
    }
    expect(Object.keys(await loadMedia()).sort()).toEqual([
      "createAlbum",
      "getAlbumsPath",
      "savePhoto",
    ]);
    expect(Object.keys(await loadShare())).toEqual(["share"]);
    expect(Object.keys(await loadFilesystem())).toEqual(["writeFile"]);
  });
});

describe("nativeImageActions", () => {
  test("each action needs all of its plugins", () => {
    const has =
      (...names: string[]) =>
      (name: string) =>
        names.includes(name);
    expect(nativeImageActions(has())).toEqual({ save: false, share: false });
    expect(nativeImageActions(has("Media"))).toEqual({ save: true, share: false });
    expect(nativeImageActions(has("Share"))).toEqual({ save: false, share: false });
    expect(nativeImageActions(has("Share", "Filesystem"))).toEqual({ save: false, share: true });
    expect(nativeImageActions(has("Media", "Share", "Filesystem"))).toEqual({
      save: true,
      share: true,
    });
  });

  test("offers nothing outside the app (the default check)", () => {
    expect(nativeImageActions()).toEqual({ save: false, share: false });
  });
});

describe("blobToBase64 and baseName", () => {
  test("encodes the bytes as they are, without a data: prefix", async () => {
    expect(await blobToBase64(PNG)).toBe(PNG_BASE64);
    const big = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(await blobToBase64(new Blob([big]))).toBe(Buffer.from(big).toString("base64"));
  });

  test("drops the extension and anything a file name should not hold", () => {
    expect(baseName("pepites-semaine-15.png")).toBe("pepites-semaine-15");
    expect(baseName("botolago-journee-9.PNG")).toBe("botolago-journee-9");
    expect(baseName("pepites-a/b c.png")).toBe("pepites-a-b-c");
    expect(baseName("../x.png")).toBe("x");
    expect(baseName(".png")).toBe("botolago");
  });
});

describe("saveImageToGallery", () => {
  test("iPhone: the camera roll, with no album (add-only access)", async () => {
    const calls: Call[] = [];
    const deps: SaveDeps = { platform: "ios", media: media(calls) };
    expect(await saveImageToGallery(PNG, "pepites-semaine-15.png", deps)).toBe("saved");
    expect(calls).toEqual([
      { method: "savePhoto", options: { path: `data:image/png;base64,${PNG_BASE64}` } },
    ]);
  });

  test("Android: into the app's BotolaGO album, created if needed", async () => {
    const calls: Call[] = [];
    const deps: SaveDeps = { platform: "android", media: media(calls) };
    expect(await saveImageToGallery(PNG, "pepites-semaine-15.png", deps)).toBe("saved");
    expect(calls).toEqual([
      { method: "getAlbumsPath", options: undefined },
      { method: "createAlbum", options: { name: ANDROID_ALBUM } },
      {
        method: "savePhoto",
        options: {
          path: `data:image/png;base64,${PNG_BASE64}`,
          albumIdentifier: "/storage/emulated/0/Android/media/botolago.com/BotolaGO",
          fileName: "pepites-semaine-15",
        },
      },
    ]);
  });

  test("Android: an album that already exists is not an error", async () => {
    const calls: Call[] = [];
    const deps: SaveDeps = {
      platform: "android",
      media: media(calls, {
        createAlbum: () => Promise.reject(rejection("Album already exists", "filesystemError")),
      }),
    };
    expect(await saveImageToGallery(PNG, "x.png", deps)).toBe("saved");
    expect(calls.map((call) => call.method)).toContain("savePhoto");
  });

  test("a refused photo permission is told apart from a failure", async () => {
    const denied: SaveDeps = {
      platform: "ios",
      media: media([], {
        savePhoto: () =>
          Promise.reject(rejection("Access to photos not allowed by user", "accessDenied")),
      }),
    };
    expect(await saveImageToGallery(PNG, "x.png", denied)).toBe("denied");
    const broken: SaveDeps = {
      platform: "android",
      media: media([], {
        savePhoto: () =>
          Promise.reject(rejection("Album identifier does not exist", "argumentError")),
      }),
    };
    expect(await saveImageToGallery(PNG, "x.png", broken)).toBe("failed");
    const unloadable: SaveDeps = {
      platform: "android",
      media: () => Promise.reject(new Error("chunk failed")),
    };
    expect(await saveImageToGallery(PNG, "x.png", unloadable)).toBe("failed");
  });

  test("outside the app it does nothing", async () => {
    const calls: Call[] = [];
    expect(await saveImageToGallery(PNG, "x.png", { platform: null, media: media(calls) })).toBe(
      "failed",
    );
    expect(calls).toEqual([]);
  });
});

describe("shareImageFile", () => {
  function deps(
    calls: Call[],
    { share, write }: { share?: () => Promise<unknown>; write?: () => Promise<unknown> } = {},
  ): ShareDeps {
    return {
      filesystem: async () => ({
        writeFile: async (options) => {
          calls.push({ method: "writeFile", options });
          if (write) await write();
          return { uri: `file:///data/user/0/botolago.com/cache/${options.path}` };
        },
      }),
      share: async () => ({
        share: async (options) => {
          calls.push({ method: "share", options });
          if (share) await share();
          return {};
        },
      }),
    };
  }
  const INPUT = {
    blob: PNG,
    fileName: "botolago-journee-9.png",
    text: "Ma journée https://botolago.com/fantasy?utm_medium=native",
    title: "Partager ma journée",
  };

  test("writes the PNG to the app's cache, then shares that file with the text", async () => {
    const calls: Call[] = [];
    expect(await shareImageFile(INPUT, deps(calls))).toBe("shared");
    expect(calls).toEqual([
      {
        method: "writeFile",
        options: {
          path: "share/botolago-journee-9.png",
          data: PNG_BASE64,
          directory: "CACHE",
          recursive: true,
        },
      },
      {
        method: "share",
        options: {
          title: INPUT.title,
          text: INPUT.text,
          files: ["file:///data/user/0/botolago.com/cache/share/botolago-journee-9.png"],
          dialogTitle: INPUT.title,
        },
      },
    ]);
  });

  test("a closed share sheet is a cancel, not a failure", async () => {
    const cancel = deps([], { share: () => Promise.reject(new Error("Share canceled")) });
    expect(await shareImageFile(INPUT, cancel)).toBe("cancelled");
  });

  test("a failure to write or to share is a failure, and nothing is shared without the file", async () => {
    const calls: Call[] = [];
    const unwritable = deps(calls, { write: () => Promise.reject(new Error("disk full")) });
    expect(await shareImageFile(INPUT, unwritable)).toBe("failed");
    expect(calls.map((call) => call.method)).toEqual(["writeFile"]);
    const broken = deps([], {
      share: () => Promise.reject(new Error("Can't share while sharing is in progress")),
    });
    expect(await shareImageFile(INPUT, broken)).toBe("failed");
  });
});
