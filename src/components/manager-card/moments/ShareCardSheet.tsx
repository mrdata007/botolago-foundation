import { useQuery } from "@tanstack/react-query";
import { Copy, Download, ImageDown, MessageCircle, Share2 } from "lucide-react";
import { useEffect, useMemo, useState, type JSX } from "react";
import { toast } from "sonner";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { useNativeImageActions } from "@/components/native/use-native-image-actions";
import { WebOnly } from "@/components/native/WebOnly";
import { ui, UiButton, UiSheet, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { leagueInviteLink, whatsappUrl } from "@/lib/league-invite";
import { saveImageToGallery, shareImageFile } from "@/lib/native-share-image";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";
import { useAuth } from "@/auth/AuthProvider";

import { cardLabel, cardStrings } from "../copy";
import { fromMyCard } from "../to-profile";
import { drawCardShareImage } from "./card-share-image";
import { previewEvent } from "./moment-text";
import {
  leagueShareLink,
  plainShareLink,
  shareMessage,
  visibleLink,
  type CardShareChannel,
} from "./share-message";

/**
 * The share sheet (plan section 4.7, G7): the manager's own card as a 1080 × 1920 picture, drawn
 * on their phone, and the message that goes with it, WhatsApp first. It opens on a tap and never
 * by itself, and only for a card with a number: an unrated card has nothing to share.
 *
 * It has the behaviour of the app's other picture sheets (`ShareImageSheet`: the phone's share
 * sheet with the picture as a file, the gallery save inside the phone app, the download where a
 * file cannot be shared, `pepites.share.*` for the words that say nothing section-specific) with
 * the order the plan asks for and a controlled `open`, which `ShareImageSheet` does not have. The
 * message names the manager's private league when they have one, and their league's join link
 * goes with it; else the landing page, tagged for the campaign. Nothing about the sharer but what
 * is on their own card leaves the phone, and a friend's card is never shared from here.
 *
 * Events: `card_share_preview_<tier>` when the picture is shown, then `card_share_whatsapp`,
 * `card_share_native`, `card_share_copy`, `card_share_download`; none carries any content.
 */
export function ShareCardSheet({
  open,
  onOpenChange,
  card,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  card: MyCardDto;
}): JSX.Element {
  const { t, lang } = useI18n();
  const { status } = useAuth();
  const { key } = useFantasyDataSource();
  const native = useNativeImageActions();
  const shareable = card.ovr !== null;
  const shown = open && shareable;

  const profile = useMemo(() => fromMyCard(card), [card]);
  const strings = useMemo(() => cardStrings(t, lang), [t, lang]);

  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"save" | "share" | null>(null);

  // The picture is drawn when the sheet opens, once per card state; the fonts and the art are the
  // browser's, so this never runs on the server.
  const drawKey = `${lang}|${card.teamId}|${card.ovr}|${card.tier}|${card.provisional}|${card.serial}|${card.name}|${card.throughGameweekSeq}|${card.season.label}`;
  useEffect(() => {
    if (!shown) return;
    let cancelled = false;
    let url: string | null = null;
    setFailed(false);
    drawCardShareImage({
      profile,
      throughGameweekSeq: card.throughGameweekSeq,
      lang,
      t,
    }).then(
      (blob) => {
        if (cancelled) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
        track(previewEvent(profile.tier));
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
    // The key is what the picture depends on; `t` and `profile` are rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, drawKey]);

  // The manager's own private league, when they have one, is what the message invites to.
  const leagues = useQuery({
    queryKey: key("leagues", "private"),
    queryFn: () => fantasyService.getLeagues("private"),
    enabled: shown && status === "authenticated",
    staleTime: 60_000,
  });
  const league = leagues.data?.find((entry) => entry.code) ?? null;

  const m6 = useMemo(
    () => ({
      league: t("card.onboarding.m6.msg.league"),
      leagueProvisional: t("card.onboarding.m6.msg.league_provisional"),
      plain: t("card.onboarding.m6.msg.plain"),
      plainProvisional: t("card.onboarding.m6.msg.plain_provisional"),
    }),
    [t],
  );
  const originLink = (channel: CardShareChannel) =>
    league?.code
      ? leagueShareLink(leagueInviteLink(league.code, undefined, "fantasy"), channel)
      : plainShareLink(channel);
  const messageFor = (channel: CardShareChannel, link: string = originLink(channel)) =>
    shareMessage({
      templates: m6,
      lang,
      ovr: card.ovr ?? 0,
      provisional: card.provisional,
      league: league ? { name: league.name } : null,
      link,
    });
  // What the sheet shows: the same sentence, with the link as its address and nothing else.
  // The address is a left-to-right run inside a possibly right-to-left sentence: isolated, or its
  // slashes would reorder it. Shown only; the message that is sent keeps the real link.
  const visible = messageFor("copy", `\u2066${visibleLink(originLink("copy"))}\u2069`);

  const fileName = "botolago-carte.png";
  const file =
    image && typeof File !== "undefined"
      ? new File([image.blob], fileName, { type: "image/png" })
      : null;
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { canShare?: (data: ShareData) => boolean })
      : null;
  const canShareFile = Boolean(file && nav?.canShare?.({ files: [file] }));
  const label = t("curva.share.label");
  const alt = `${cardLabel(profile, strings)}${card.provisional ? `, ${t("card.provisional")}` : ""}`;

  const pill = cn(
    "inline-flex items-center justify-center gap-2 px-4",
    ui.space.row,
    ui.radius.full,
    ui.surface.sunken,
    ui.tone.default,
    ui.text.bodyStrong,
    ui.focus,
  );

  const footer = (
    <div className="flex flex-col gap-2 pb-3">
      <a
        href={whatsappUrl(messageFor("whatsapp"))}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="card-share-whatsapp"
        onClick={() => {
          track("card_share_whatsapp");
          onOpenChange(false);
        }}
        className={cn(
          "inline-flex items-center justify-center gap-2 px-4",
          ui.space.row,
          ui.radius.full,
          ui.text.bodyStrong,
          ui.focus,
          "text-[color:var(--ui-ink-deep)]",
        )}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
      >
        <MessageCircle className="h-4 w-4" aria-hidden />
        {t("pepites.share.whatsapp")}
      </a>
      {native.share && image ? (
        <UiButton
          variant="soft"
          disabled={busy !== null}
          data-testid="card-share-native"
          onClick={async () => {
            setBusy("share");
            const result = await shareImageFile({
              blob: image.blob,
              fileName,
              text: messageFor("native"),
              title: label,
            });
            setBusy(null);
            if (result === "shared") {
              track("card_share_native");
              onOpenChange(false);
            } else if (result === "failed") {
              toast.error(t("pepites.share.native_failed"));
            }
          }}
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {t("pepites.share.native")}
        </UiButton>
      ) : canShareFile && file ? (
        <UiButton
          variant="soft"
          data-testid="card-share-native"
          onClick={async () => {
            try {
              await navigator.share({ files: [file], text: messageFor("native") });
              track("card_share_native");
              onOpenChange(false);
            } catch {
              // Declined, not failed.
            }
          }}
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {t("pepites.share.native")}
        </UiButton>
      ) : null}
      <UiButton
        variant="soft"
        data-testid="card-share-copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(messageFor("copy"));
            toast.success(t("article.share_copied"));
            track("card_share_copy");
            onOpenChange(false);
          } catch {
            toast.error(t("pepites.share.copy_failed"));
          }
        }}
      >
        <Copy className="h-4 w-4" aria-hidden />
        {t("pepites.share.copy")}
      </UiButton>
      {/* A file download is for where the phone cannot share a file: not inside the phone app
          (neither shell handles a blob download) and not where the share sheet takes the file. */}
      {image && !canShareFile && !native.share ? (
        <WebOnly>
          <a
            href={image.url}
            download={fileName}
            data-testid="card-share-download"
            onClick={() => track("card_share_download")}
            className={pill}
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
          data-testid="card-share-save"
          className={cn(pill, "disabled:opacity-60")}
          onClick={async () => {
            setBusy("save");
            const result = await saveImageToGallery(image.blob, fileName);
            setBusy(null);
            if (result === "saved") {
              toast.success(t("pepites.share.saved"));
              track("card_share_download");
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
    </div>
  );

  return (
    <UiSheet open={shown} onOpenChange={onOpenChange} title={label} footer={footer}>
      <div className="flex flex-col items-center gap-3 p-4" data-testid="card-share-sheet">
        {image ? (
          <img
            src={image.url}
            alt={alt}
            data-testid="card-share-image"
            className={cn("aspect-[9/16] w-full max-w-[11rem]", ui.radius.card, ui.shadow.card)}
          />
        ) : failed ? (
          <p className={cn(ui.text.meta, ui.tone.muted)}>{t("pepites.share.image_failed")}</p>
        ) : (
          <div className="flex aspect-[9/16] w-full max-w-[11rem] items-center justify-center">
            <UiStatePanel kind="loading" />
          </div>
        )}
        <p
          className={cn("w-full max-w-[20rem] text-center", ui.text.meta, ui.tone.muted)}
          data-testid="card-share-message"
        >
          {visible}
        </p>
      </div>
    </UiSheet>
  );
}
