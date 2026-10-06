import { Copy, Download, ImageDown, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useNativeImageActions } from "@/components/native/use-native-image-actions";
import { WebOnly } from "@/components/native/WebOnly";
import { whatsappUrl } from "@/components/predictions/leagues/invite-link";
import { ui, UiButton, UiIconButton, UiSheet, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { saveImageToGallery, shareImageFile } from "@/lib/native-share-image";
import { cn } from "@/lib/utils";

export type ShareChannel = "native" | "whatsapp" | "copy" | "download";

/**
 * What a viewer did in the sheet. `preview` is the picture shown; `native`
 * fires only once the system share sheet reports it was sent (a cancel is a
 * cancel, not a share); `whatsapp` is WhatsApp opened with the message, which
 * is an intent, not a sent message.
 */
export type ShareSheetEvent = "preview" | ShareChannel;

/**
 * A share button and its sheet: the picture (drawn on the phone), and the
 * page's link, tagged with the channel and the `campaign`. `renderKey` says
 * when the picture must be drawn again; numbers in `message` should already
 * be isolated (U+2068…U+2069) so WhatsApp keeps their order in an Arabic line.
 *
 * Shared by Pépites and the Fantasy gameweek recap; what each one draws and
 * says stays with it. The button labels are the `pepites.share.*` keys, which
 * say nothing Pépites-specific ("Partager l'image", "Copier le lien" …).
 *
 * Inside the phone app, when the app has the plugins for it
 * (`useNativeImageActions`), "Partager l'image" goes through the phone's own
 * share sheet with the picture as a file, and "Enregistrer dans la galerie"
 * takes the place of the browser's download. Saving reports `download`: it is
 * the app's way of keeping the picture.
 */
export function ShareImageSheet({
  label,
  render,
  renderKey,
  imageAlt,
  aspect,
  fileName,
  message,
  path,
  testId,
  campaign,
  testIdPrefix = "pepites",
  onEvent,
}: {
  label: string;
  render: () => Promise<Blob>;
  renderKey: string;
  imageAlt: string;
  aspect: "post" | "story";
  fileName: string;
  message: string;
  path: string;
  testId: string;
  /** The `utm_campaign` the shared link carries. */
  campaign: string;
  /** Prefix of the image and download test ids. */
  testIdPrefix?: string;
  /** Called for each share step; never given any content of the share. */
  onEvent?: (event: ShareSheetEvent) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const native = useNativeImageActions();
  const [busy, setBusy] = useState<"save" | "share" | null>(null);

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
        onEvent?.("preview");
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

  const link = (channel: ShareChannel) => {
    const origin =
      (typeof window !== "undefined" ? window.location?.origin : undefined) ?? PUBLIC_SITE_ORIGIN;
    const url = new URL(path, origin);
    url.searchParams.set("utm_source", "share");
    url.searchParams.set("utm_medium", channel);
    url.searchParams.set("utm_campaign", campaign);
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
      <UiIconButton aria-label={label} onClick={() => setOpen(true)} data-testid={testId}>
        <Share2 aria-hidden />
      </UiIconButton>
      <UiSheet open={open} onOpenChange={setOpen} title={label}>
        <div className="flex flex-col gap-3 p-4">
          {image ? (
            <img
              src={image.url}
              alt={imageAlt}
              data-testid={`${testIdPrefix}-share-image`}
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
          {native.share && image ? (
            <UiButton
              variant="ink"
              disabled={busy !== null}
              data-testid={`${testIdPrefix}-share-native-app`}
              onClick={async () => {
                setBusy("share");
                const result = await shareImageFile({
                  blob: image.blob,
                  fileName,
                  text: `${message} ${link("native")}`,
                  title: label,
                });
                setBusy(null);
                if (result === "shared") {
                  onEvent?.("native");
                  setOpen(false);
                } else if (result === "failed") {
                  toast.error(t("pepites.share.native_failed"));
                }
                // "cancelled": declined, not failed.
              }}
            >
              <Share2 className="h-4 w-4" aria-hidden />
              {t("pepites.share.native")}
            </UiButton>
          ) : canShareFile && file ? (
            <UiButton
              variant="ink"
              onClick={async () => {
                try {
                  await navigator.share({ files: [file], text: `${message} ${link("native")}` });
                  onEvent?.("native");
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
          {/* Not inside the phone app (`WebOnly`): a `download` link to a
              blob is a file download, and neither Capacitor shell handles one
              (no download delegate on iPhone, no download listener on
              Android), so the tap did nothing. An app that has the Media
              plugin saves to the photos instead (below); an older app keeps
              the system share button above where the phone supports it
              (iPhone). WhatsApp and the link work everywhere. */}
          {image ? (
            <WebOnly>
              <a
                href={image.url}
                download={fileName}
                data-testid={`${testIdPrefix}-share-download`}
                onClick={() => onEvent?.("download")}
                className={secondary}
              >
                <Download className="h-4 w-4" aria-hidden />
                {t("pepites.share.download")}
              </a>
            </WebOnly>
          ) : null}
          {native.save && image ? (
            <button
              type="button"
              disabled={busy !== null}
              data-testid={`${testIdPrefix}-share-save`}
              className={cn(secondary, "disabled:opacity-60")}
              onClick={async () => {
                setBusy("save");
                const result = await saveImageToGallery(image.blob, fileName);
                setBusy(null);
                if (result === "saved") {
                  toast.success(t("pepites.share.saved"));
                  onEvent?.("download");
                } else {
                  toast.error(
                    result === "denied"
                      ? t("pepites.share.save_denied")
                      : t("pepites.share.save_failed"),
                  );
                }
              }}
            >
              <ImageDown className="h-4 w-4" aria-hidden />
              {t("pepites.share.save")}
            </button>
          ) : null}
          <a
            href={whatsappUrl(`${message} ${link("whatsapp")}`)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              onEvent?.("whatsapp");
              setOpen(false);
            }}
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
                onEvent?.("copy");
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
