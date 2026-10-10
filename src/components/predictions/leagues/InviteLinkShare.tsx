import { Copy, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";

import { ui, UiButton, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { inviteMessage } from "@/lib/league-invite";
import { cn } from "@/lib/utils";
import { inviteLink, whatsappUrl, type InviteGame } from "./invite-link";

/**
 * Share a league's invite link: the phone's share sheet, WhatsApp, or copy.
 * The code rides after "#" (see invite-link.ts). When `showCode` is set — at
 * creation and after a new code — the code itself is shown once, with the
 * warning that it will not be shown again (only a digest is stored).
 *
 * `game` is the game the invite goes out from: one league serves both, and the
 * link names it so the recipient lands on the right join. Pronostics is the
 * default and is unchanged. "fantasy" (the Fantasy league pages) links to the
 * Fantasy join, sends the Fantasy hub's message, says "Lien copié" in the
 * Fantasy wording and counts no Pronostics share.
 */
export function InviteLinkShare({
  league,
  code,
  showCode = false,
  game = "predictions",
}: {
  league: string;
  code: string;
  showCode?: boolean;
  game?: InviteGame;
}) {
  const { t } = useI18n();
  const fantasy = game === "fantasy";
  const link = inviteLink(code, undefined, game);
  // Direction isolation around the league name, so WhatsApp keeps the order
  // in an Arabic message (plan §10).
  const isolatedLeague = `⁨${league}⁩`;
  const text = fantasy
    ? inviteMessage(t("fantasy.hub.invite_message"), isolatedLeague, link)
    : t("predictions.leagues.share_text")
        .replace("{league}", isolatedLeague)
        .replace("{link}", link);
  // A Pronostics share is counted; the Fantasy invite has no event of its own.
  const counted = () => {
    if (!fantasy) track("pronostics_share");
  };

  const nativeShare = async () => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ text });
        counted();
      } catch {
        // Declined, not failed.
      }
      return;
    }
    await copy();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      counted();
      toast.success(fantasy ? t("fantasy.hub.invite_copied") : t("article.share_copied"));
    } catch {
      toast.error(fantasy ? t("state.error") : t("predictions.save.offline"));
    }
  };

  return (
    <UiCard
      padding="md"
      className="flex flex-col gap-3"
      testId={fantasy ? "fantasy-invite-share" : "predictions-invite-share"}
    >
      {showCode ? (
        <div className="flex flex-col gap-1">
          <p className={cn(ui.text.label, ui.tone.muted)}>{t("predictions.leagues.code_label")}</p>
          <p
            dir="ltr"
            className={cn("break-all", ui.text.bodyStrong, ui.text.tabular)}
            data-testid={fantasy ? "fantasy-invite-code" : "predictions-invite-code"}
          >
            {code}
          </p>
          <p className={cn(ui.text.meta, ui.tone.muted)}>{t("predictions.leagues.code_once")}</p>
        </div>
      ) : null}
      <p className={ui.text.bodyStrong}>{t("predictions.leagues.share_link")}</p>
      <div className="flex flex-wrap gap-2">
        <UiButton size="sm" variant="ink" onClick={() => void nativeShare()}>
          <Share2 className="h-4 w-4" aria-hidden />
          {t("article.share")}
        </UiButton>
        <a
          href={whatsappUrl(text)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={counted}
          className={cn(
            "inline-flex items-center gap-2 px-4",
            ui.space.tap,
            ui.radius.full,
            ui.surface.sunken,
            ui.tone.ink,
            ui.text.bodyStrong,
            ui.focus,
          )}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          {t("predictions.share.whatsapp")}
        </a>
        <UiButton size="sm" variant="soft" onClick={() => void copy()}>
          <Copy className="h-4 w-4" aria-hidden />
          {t("predictions.leagues.copy_link")}
        </UiButton>
      </div>
    </UiCard>
  );
}
