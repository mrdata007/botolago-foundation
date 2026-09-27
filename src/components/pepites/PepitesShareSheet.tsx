import { Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { whatsappUrl } from "@/components/predictions/leagues/invite-link";
import { ui, UiButton, UiIconButton, UiSheet, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { cn } from "@/lib/utils";

type Channel = "native" | "whatsapp" | "copy" | "download";

/**
 * A share button and its sheet: the picture (drawn on the phone), and the
 * page's link, tagged with the channel. `renderKey` says when the picture
 * must be drawn again; numbers in `message` should already be isolated
 * (U+2068…U+2069) so WhatsApp keeps their order in an Arabic line.
 */
export function PepitesShareSheet({
  label,
  render,
  renderKey,
  imageAlt,
  aspect,
  fileName,
  message,
  path,
  onNight = false,
  testId,
}: {
  label: string;
  render: () => Promise<Blob>;
  renderKey: string;
  imageAlt: string;
  aspect: "post" | "story";
  fileName: string;
  message: string;
  path: string;
  onNight?: boolean;
  testId: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let url: string | null = null;
    setFailed(false);
    render().then(
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
    // `render` is rebuilt each render; `renderKey` is what it draws.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, renderKey]);

  const link = (channel: Channel) => {
    const origin = typeof window !== "undefined" ? window.location.origin : PUBLIC_SITE_ORIGIN;
    const url = new URL(path, origin);
    url.searchParams.set("utm_source", "share");
    url.searchParams.set("utm_medium", channel);
    url.searchParams.set("utm_campaign", "pepites");
    return url.toString();
  };
  const file =
    image && typeof File !== "undefined"
      ? new File([image.blob], fileName, { type: "image/png" })
      : null;
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { canShare?: (data: ShareData) => boolean })
      : null;
  const canShareFile = Boolean(file && nav?.canShare?.({ files: [file] }));
  const secondary = cn(
    "inline-flex items-center justify-center gap-2 px-4",
    ui.space.tap,
    ui.radius.full,
    ui.surface.sunken,
    ui.tone.ink,
    ui.text.bodyStrong,
    ui.focus,
  );

  return (
    <>
      <UiIconButton
        variant={onNight ? "glass" : "soft"}
        aria-label={label}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        <Share2 aria-hidden />
      </UiIconButton>
      <UiSheet open={open} onOpenChange={setOpen} title={label}>
        <div className="flex flex-col gap-3 p-4">
          {image ? (
            <img
              src={image.url}
              alt={imageAlt}
              data-testid="pepites-share-image"
              className={cn(
                "mx-auto w-full",
                aspect === "post" ? "aspect-[4/5] max-w-[18rem]" : "aspect-[9/16] max-w-[14rem]",
                ui.radius.card,
              )}
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
              className={secondary}
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
            className={secondary}
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
