import { Share2 } from "lucide-react";
import { toast } from "sonner";

import { UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { shareLink } from "@/lib/share-link";
import { shareablePageUrl } from "@/lib/share-url";

/**
 * The round share control in a Fantasy header (top players, a player page).
 *
 * `navigator.share` exists on phones and almost nowhere on the desktop web, so
 * guarding on it and doing nothing else left the button visibly inert for
 * every desktop reader. Copying the link is the same intent by another route,
 * and it is what the article and match pages do. A dismissed share sheet
 * rejects; that is the reader declining, so it never falls through to copying
 * a link they did not ask for (`shareLink`).
 *
 * The link is the page's address without the campaign tags and fragment it was
 * opened with. A copy that did not happen says "le lien n'a pas pu être copié",
 * not a connection error: the clipboard is not the network.
 */
export function ShareButton({ title }: { title: string }) {
  const { t } = useI18n();

  const share = async () => {
    if (typeof window === "undefined") return;
    const url = shareablePageUrl(window.location.href);
    const result = await shareLink({ title, url });
    if (result === "copied") toast.success(t("article.share_copied"));
    else if (result === "failed") toast.error(t("pepites.share.copy_failed"));
  };

  return (
    <UiIconButton aria-label={t("article.share")} onClick={() => void share()}>
      <Share2 aria-hidden />
    </UiIconButton>
  );
}
