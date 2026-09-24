import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

/**
 * The round share control in a Fantasy header (top players, a player page).
 *
 * `navigator.share` exists on phones and almost nowhere on the desktop web, so
 * guarding on it and doing nothing else left the button visibly inert for
 * every desktop reader. Copying the link is the same intent by another route,
 * and it is what the article and match pages do. A dismissed share sheet
 * rejects; that is the reader declining, so it never falls through to copying
 * a link they did not ask for.
 */
export function ShareButton({ title }: { title: string }) {
  const { t } = useI18n();

  const share = async () => {
    const url = typeof window === "undefined" ? "" : window.location.href;
    if (!url) return;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ title, url });
      } catch {
        // Declined, not failed.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("article.share_copied"));
    } catch {
      toast.error(t("fantasy.error.network"));
    }
  };

  return (
    <UiIconButton aria-label={t("article.share")} onClick={() => void share()}>
      <Share2 aria-hidden />
    </UiIconButton>
  );
}
