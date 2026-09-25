import { Copy, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ui, UiButton, UiIconButton, UiSheet } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { cn } from "@/lib/utils";
import { whatsappUrl } from "./leagues/invite-link";
import { shareAfterTemplate } from "./predictions-copy";

export interface ShareTally {
  /** Exact scores plus right outcomes, out of the matches scored. */
  readonly correct: number;
  readonly played: number;
  readonly exact: number;
}

type Channel = "native" | "whatsapp" | "copy";

/**
 * Share the journée (plan §9): a link to /pronostics?journee=N tagged with
 * the channel, never the player's score (it could not be trusted, and there
 * are no public profiles). Before results: "J'ai fait mes pronostics…";
 * after: "6/8 bons pronostics, dont 2 scores exacts…". Names and numbers are
 * isolated (U+2068…U+2069) so WhatsApp keeps the order in Arabic.
 */
export function PredictionsShareButton({
  roundNumber,
  tally,
  onShare,
}: {
  roundNumber: number;
  tally: ShareTally | null;
  onShare?: (channel: Channel) => void;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  // "6/8" is isolated whole: two separate isolates would read "8/6" in Arabic.
  const isolate = (value: number | string) => `⁨${value}⁩`;
  const link = (channel: Channel) => {
    const origin = typeof window !== "undefined" ? window.location.origin : PUBLIC_SITE_ORIGIN;
    const url = new URL("/pronostics", origin);
    url.searchParams.set("journee", String(roundNumber));
    url.searchParams.set("utm_source", "share");
    url.searchParams.set("utm_medium", channel);
    url.searchParams.set("utm_campaign", "pronostics");
    return url.toString();
  };
  const message =
    tally && tally.played > 0
      ? shareAfterTemplate(tally.exact, lang, t)
          .replace("{n}", isolate(roundNumber))
          .replace("{score}", isolate(`${tally.correct}/${tally.played}`))
          .replace("{exact}", isolate(tally.exact))
      : t("predictions.share.before").replace("{n}", isolate(roundNumber));
  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof (navigator as Navigator & { share?: unknown }).share === "function";

  const done = (channel: Channel) => {
    track("pronostics_share");
    onShare?.(channel);
    setOpen(false);
  };

  return (
    <>
      <UiIconButton aria-label={t("predictions.share.title")} onClick={() => setOpen(true)}>
        <Share2 aria-hidden />
      </UiIconButton>
      <UiSheet open={open} onOpenChange={setOpen} title={t("predictions.share.title")}>
        <div className={cn("flex flex-col gap-2 p-4")}>
          <p className={cn(ui.text.meta, ui.tone.muted)}>{message}</p>
          {canNativeShare ? (
            <UiButton
              variant="ink"
              onClick={async () => {
                try {
                  await navigator.share({ text: message, url: link("native") });
                  done("native");
                } catch {
                  // Declined, not failed.
                }
              }}
            >
              <Share2 className="h-4 w-4" aria-hidden />
              {t("article.share")}
            </UiButton>
          ) : null}
          <a
            href={whatsappUrl(`${message} ${link("whatsapp")}`)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => done("whatsapp")}
            className={cn(
              "inline-flex items-center justify-center gap-2 px-4",
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
          <UiButton
            variant="soft"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${message} ${link("copy")}`);
                toast.success(t("article.share_copied"));
                done("copy");
              } catch {
                toast.error(t("predictions.save.offline"));
              }
            }}
          >
            <Copy className="h-4 w-4" aria-hidden />
            {t("predictions.leagues.copy_link")}
          </UiButton>
        </div>
      </UiSheet>
    </>
  );
}
