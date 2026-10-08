import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import { ui, UiButton, UiInput, UiSheet, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { inviteMessage, leagueInviteLink, whatsappUrl } from "@/lib/league-invite";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

/**
 * « Inviter des amis »: the soft button of the born panel and the arrival hero (plan 5.3), and the
 * existing league create-and-invite flow behind it, in a sheet (plan 5.1 M2: "opens the existing
 * league create-and-invite flow, WhatsApp first").
 *
 * With a private league that has an invite code, the sheet goes straight to sharing that league;
 * with none, it asks for a name and makes one, the way the hub's « Créer une ligue et inviter »
 * does (same service call, same invite message and link). WhatsApp comes first, then the phone's
 * share sheet, then « Copier le lien ». It is a tap that opens it, never anything else, and it
 * writes nothing until the manager has typed a name and confirmed.
 *
 * `onInvite` fires when the sheet opens (the born panel counts `card_born_invite` and
 * acknowledges the moment).
 */
export function InviteFriends({ onInvite }: { onInvite?: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <UiButton
        variant="soft"
        data-testid="invite-friends"
        onClick={() => {
          setOpen(true);
          onInvite?.();
        }}
      >
        {t("fantasy.hub.invite_share")}
      </UiButton>
      {open ? <InviteSheet open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

function InviteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { key } = useFantasyDataSource();
  const leagues = useQuery({
    queryKey: key("leagues", "private"),
    queryFn: () => fantasyService.getLeagues("private"),
    staleTime: 60_000,
  });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; code: string } | null>(null);

  const existing = leagues.data?.find((league) => league.code);
  const target = created ?? (existing?.code ? { name: existing.name, code: existing.code } : null);
  const link = target ? leagueInviteLink(target.code, undefined, "fantasy") : "";
  const message = target ? inviteMessage(t("fantasy.hub.invite_message"), target.name, link) : "";

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    try {
      const league = await fantasyService.createLeague(trimmed);
      await qc.invalidateQueries({ queryKey: key("leagues", "private") });
      if (league.code) setCreated({ name: trimmed, code: league.code });
      else {
        toast.success(t("fantasy.leagues.created"));
        onOpenChange(false);
      }
      setName("");
    } catch (error) {
      if (isMfaStepUpError(error)) showStepUpNotice(t);
      else toast.error(t("state.error"));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      try {
        await nav.share({ text: message });
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
      toast.success(t("fantasy.hub.invite_copied"));
    } catch {
      toast.error(t("state.error"));
    }
  };

  const secondary = cn(
    "inline-flex items-center justify-center gap-2 px-4",
    ui.space.row,
    ui.radius.full,
    ui.surface.sunken,
    ui.tone.default,
    ui.text.bodyStrong,
    ui.focus,
  );

  return (
    <UiSheet open={open} onOpenChange={onOpenChange} title={t("fantasy.hub.invite_share")}>
      <div className="flex flex-col gap-3 p-4" data-testid="invite-sheet">
        {leagues.isLoading ? (
          <UiSkeleton className="h-12 w-full" />
        ) : target ? (
          <>
            <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
              {t("fantasy.hub.invite_ready").replace("{name}", target.name)}
            </p>
            <a
              href={whatsappUrl(message)}
              target="_blank"
              rel="noopener noreferrer"
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
              {t("fantasy.hub.invite_whatsapp")}
            </a>
            <UiButton variant="soft" onClick={() => void share()}>
              <Share2 className="h-4 w-4" aria-hidden />
              {t("article.share")}
            </UiButton>
            <button type="button" className={secondary} onClick={() => void copy()}>
              <Link2 className="h-4 w-4" aria-hidden />
              {t("fantasy.hub.invite_copy")}
            </button>
          </>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <UiInput
              label={t("fpl.league_name")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={40}
              fieldClassName={cn(
                ui.radius.card,
                "min-h-[var(--ui-row-min)] border-[color:var(--ui-rule-strong)]",
              )}
            />
            <UiButton type="submit" disabled={name.trim().length < 3 || busy}>
              {busy ? t("fpl.saving") : t("fantasy.hub.create_invite")}
            </UiButton>
          </form>
        )}
      </div>
    </UiSheet>
  );
}
