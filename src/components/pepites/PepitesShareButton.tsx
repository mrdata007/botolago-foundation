import { Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { PepitesEdition } from "@/backend/pepites/contracts";
import { whatsappUrl } from "@/components/predictions/leagues/invite-link";
import { ui, UiButton, UiIconButton, UiSheet, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { cn } from "@/lib/utils";

import { renderShareImage, shareImageModel } from "./share-image";

type Channel = "native" | "whatsapp" | "copy" | "download";

/**
 * Share a published edition: the image of its Top 10 (drawn on the phone,
 * `share-image.ts`) and a link to its week page, tagged with the channel.
 * Numbers in the message are isolated (U+2068…U+2069) so WhatsApp keeps
 * their order in an Arabic line.
 */
export function PepitesShareButton({
  edition,
}: {
  edition: Pick<PepitesEdition, "week" | "status" | "entries">;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const model = shareImageModel(edition, lang, {
    kicker: t("pepites.share.kicker"),
    title: t("pepites.share.image_title"),
    subtitle: t("pepites.share.image_subtitle"),
    footer: "botolago.com/pepites",
  });

  const modelKey = model ? JSON.stringify(model) : null;
  useEffect(() => {
    if (!open || !model) return;
    let cancelled = false;
    let url: string | null = null;
    setFailed(false);
    const family = getComputedStyle(document.body).fontFamily || "sans-serif";
    renderShareImage(model, family).then(
      (blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setImage(null);
    };
    // The model is rebuilt each render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, modelKey]);

  if (!model) return null;

  const link = (channel: Channel) => {
    const origin = typeof window !== "undefined" ? window.location.origin : PUBLIC_SITE_ORIGIN;
    const url = new URL(`/pepites/semaine/${edition.week}`, origin);
    url.searchParams.set("utm_source", "share");
    url.searchParams.set("utm_medium", channel);
    url.searchParams.set("utm_campaign", "pepites");
    return url.toString();
  };
  const message = t("pepites.share.message").replace("{n}", `⁨${edition.week}⁩`);
  const fileName = `pepites-semaine-${edition.week}.png`;
  const file =
    image && typeof File !== "undefined"
      ? new File([image.blob], fileName, { type: "image/png" })
      : null;
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { canShare?: (data: ShareData) => boolean })
      : null;
  const canShareFile = Boolean(file && nav?.canShare?.({ files: [file] }));

  return (
    <>
      <UiIconButton
        aria-label={t("pepites.share.title")}
        onClick={() => setOpen(true)}
        data-testid="pepites-share"
      >
        <Share2 aria-hidden />
      </UiIconButton>
      <UiSheet open={open} onOpenChange={setOpen} title={t("pepites.share.title")}>
        <div className="flex flex-col gap-3 p-4">
          {image ? (
            <img
              src={image.url}
              alt={t("pepites.share.image_alt").replace("{n}", String(edition.week))}
              data-testid="pepites-share-image"
              className={cn("mx-auto aspect-[4/5] w-full max-w-[18rem]", ui.radius.card)}
            />
          ) : failed ? (
            <p className={cn(ui.text.meta, ui.tone.muted)}>{t("pepites.share.image_failed")}</p>
          ) : (
            <UiStatePanel kind="loading" />
          )}
          <p className={cn(ui.text.meta, ui.tone.muted)}>{message}</p>
          {canShareFile && file ? (
            <UiButton
              variant="ink"
              onClick={async () => {
                try {
                  await navigator.share({ files: [file], text: `${message} ${link("native")}` });
                  setOpen(false);
                } catch {
                  // Declined, not failed.
                }
              }}
            >
              <Share2 className="h-4 w-4" aria-hidden />
              {t("pepites.share.native")}
            </UiButton>
          ) : null}
          {image ? (
            <a
              href={image.url}
              download={fileName}
              data-testid="pepites-share-download"
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
              <Download className="h-4 w-4" aria-hidden />
              {t("pepites.share.download")}
            </a>
          ) : null}
          <a
            href={whatsappUrl(`${message} ${link("whatsapp")}`)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
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
            {t("pepites.share.whatsapp")}
          </a>
          <UiButton
            variant="soft"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${message} ${link("copy")}`);
                toast.success(t("article.share_copied"));
                setOpen(false);
              } catch {
                toast.error(t("pepites.share.copy_failed"));
              }
            }}
          >
            <Copy className="h-4 w-4" aria-hidden />
            {t("pepites.share.copy")}
          </UiButton>
        </div>
      </UiSheet>
    </>
  );
}
