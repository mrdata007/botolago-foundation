import type { Directory } from "@capacitor/filesystem";

import { nativePlatform, nativePluginAvailable, type NativePlatform } from "@/lib/native-app";

/**
 * Keeping and sending a share picture from inside the phone app, where a web
 * page cannot: a `download` link does nothing in either shell, and Android's
 * WebView has no Web Share API. Three native plugins do it instead:
 *
 *  - save: `@capacitor-community/media` adds the PNG to the phone's photos.
 *    iPhone asks for "add only" access (the app can add a photo, never see the
 *    library) and puts it in the camera roll. Android needs no permission: the
 *    picture goes into a BotolaGO album in the app's own media folder, which
 *    the gallery lists (and which Android removes with the app).
 *  - share: `@capacitor/filesystem` writes the PNG to the app's cache, and
 *    `@capacitor/share` hands that file, the message and the link to the
 *    phone's share sheet.
 *
 * Each action exists only where its plugins are in the running app
 * (`nativeImageActions`). The plugins are loaded on first use, never in a
 * browser.
 */

export const SAVE_PLUGINS = ["Media"] as const;
export const SHARE_PLUGINS = ["Share", "Filesystem"] as const;

/** The album the pictures go into on Android (iPhone uses the camera roll). */
export const ANDROID_ALBUM = "BotolaGO";

export interface NativeImageActions {
  readonly save: boolean;
  readonly share: boolean;
}

export const NO_NATIVE_IMAGE_ACTIONS: NativeImageActions = { save: false, share: false };

/** What this app can do with the picture; both `false` in a browser and in an older app build. */
export function nativeImageActions(
  available: (name: string) => boolean = nativePluginAvailable,
): NativeImageActions {
  return {
    save: SAVE_PLUGINS.every((name) => available(name)),
    share: SHARE_PLUGINS.every((name) => available(name)),
  };
}

type MediaPlugin = Pick<
  (typeof import("@capacitor-community/media"))["Media"],
  "savePhoto" | "createAlbum" | "getAlbumsPath"
>;
type SharePlugin = Pick<(typeof import("@capacitor/share"))["Share"], "share">;
type FilesystemPlugin = Pick<(typeof import("@capacitor/filesystem"))["Filesystem"], "writeFile">;

export interface SaveDeps {
  readonly platform: NativePlatform | null;
  readonly media: () => Promise<MediaPlugin>;
}

export interface ShareDeps {
  readonly share: () => Promise<SharePlugin>;
  readonly filesystem: () => Promise<FilesystemPlugin>;
}

// A Capacitor plugin is a proxy that turns any property into a call to the
// phone, `then` included. Resolving a promise with it makes the promise call
// `plugin.then(…)`, which the phone does not answer, so the promise never
// settles. Each loader therefore hands back a plain object around the plugin.

/** The Media plugin, loaded on first use. */
export async function loadMedia(): Promise<MediaPlugin> {
  const { Media } = await import("@capacitor-community/media");
  return {
    savePhoto: (options) => Media.savePhoto(options),
    createAlbum: (options) => Media.createAlbum(options),
    getAlbumsPath: () => Media.getAlbumsPath(),
  };
}

/** The Share plugin, loaded on first use. */
export async function loadShare(): Promise<SharePlugin> {
  const { Share } = await import("@capacitor/share");
  return { share: (options) => Share.share(options) };
}

/** The Filesystem plugin, loaded on first use. */
export async function loadFilesystem(): Promise<FilesystemPlugin> {
  const { Filesystem } = await import("@capacitor/filesystem");
  return { writeFile: (options) => Filesystem.writeFile(options) };
}

const defaultSaveDeps = (): SaveDeps => ({ platform: nativePlatform(), media: loadMedia });

const defaultShareDeps = (): ShareDeps => ({ share: loadShare, filesystem: loadFilesystem });

/** `blob` as base64, without the `data:` prefix. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let at = 0; at < bytes.length; at += chunk) {
    binary += String.fromCharCode(...bytes.subarray(at, at + chunk));
  }
  return btoa(binary);
}

/** "pepites-semaine-15.png" → "pepites-semaine-15": Android adds the extension itself. */
export function baseName(fileName: string): string {
  const name = fileName.replace(/\.png$/i, "").replace(/[^\p{L}\p{N}._-]+/gu, "-");
  return name.replace(/^[-.]+|[-.]+$/g, "") || "botolago";
}

function errorCode(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

export type SaveResult = "saved" | "denied" | "failed";

/** Adds the picture to the phone's photos. Never throws. */
export async function saveImageToGallery(
  blob: Blob,
  fileName: string,
  deps: SaveDeps = defaultSaveDeps(),
): Promise<SaveResult> {
  try {
    if (!deps.platform) return "failed";
    const media = await deps.media();
    const path = `data:image/png;base64,${await blobToBase64(blob)}`;
    if (deps.platform === "ios") {
      // No album: an album would need full access to the library, and the
      // camera roll needs only "add".
      await media.savePhoto({ path });
      return "saved";
    }
    // Android: into the app's own album, which needs no permission. Creating
    // it fails once it exists, which is fine; saving says if it really is not there.
    const root = (await media.getAlbumsPath()).path.replace(/\/+$/, "");
    await media.createAlbum({ name: ANDROID_ALBUM }).catch(() => undefined);
    await media.savePhoto({
      path,
      albumIdentifier: `${root}/${ANDROID_ALBUM}`,
      fileName: baseName(fileName),
    });
    return "saved";
  } catch (error) {
    return errorCode(error) === "accessDenied" ? "denied" : "failed";
  }
}

export type ShareResult = "shared" | "cancelled" | "failed";

/** Hands the picture, `text` and `title` to the phone's share sheet. Never throws. */
export async function shareImageFile(
  { blob, fileName, text, title }: { blob: Blob; fileName: string; text: string; title: string },
  deps: ShareDeps = defaultShareDeps(),
): Promise<ShareResult> {
  let file: string;
  try {
    const filesystem = await deps.filesystem();
    const written = await filesystem.writeFile({
      path: `share/${baseName(fileName)}.png`,
      data: await blobToBase64(blob),
      // Directory.Cache, by value: importing the enum would load the plugin in browsers.
      directory: "CACHE" as Directory,
      recursive: true,
    });
    file = written.uri;
  } catch {
    return "failed";
  }
  try {
    const share = await deps.share();
    await share.share({ title, text, files: [file], dialogTitle: title });
    return "shared";
  } catch (error) {
    // Both phones reject with "Share canceled" when the sheet is closed.
    const message = error instanceof Error ? error.message : String(error);
    return /cancel/i.test(message) ? "cancelled" : "failed";
  }
}
