import { copyText } from "@/lib/copy-text";

/**
 * What a share tap came to:
 *  - `shared`: the phone's share sheet reported the link was sent;
 *  - `cancelled`: the person closed the share sheet, which is their answer,
 *    so nothing is copied behind their back;
 *  - `copied`: there is no share sheet (or it failed), and the link is on the
 *    clipboard;
 *  - `failed`: it is neither shared nor copied. The caller says so and, where
 *    the link is not already on screen, shows it to copy by hand.
 */
export type ShareLinkResult = "shared" | "cancelled" | "copied" | "failed";

function isCancel(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

/**
 * Shares `data` through the Web Share API when the browser has it, else (or
 * when it fails for a reason other than the person cancelling) copies `copy`,
 * which is the link by default. Never throws.
 */
export async function shareLink(
  data: { title?: string; text?: string; url?: string },
  copy: string | undefined = data.url,
): Promise<ShareLinkResult> {
  const nav = typeof navigator === "undefined" ? null : (navigator as Navigator);
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share(data);
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "cancelled";
      // A share sheet that cannot open (a blocked permission, an in-app
      // browser) is not the person declining: fall through to copying.
    }
  }
  if (!copy) return "failed";
  return (await copyText(copy)) ? "copied" : "failed";
}
