import { useQueryClient } from "@tanstack/react-query";
import { Link2, MessageCircle, Plus, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import { ui, UiButton, UiCard, UiInput } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { inviteMessage, leagueInviteLink, whatsappUrl } from "@/lib/league-invite";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

/**
 * "Créer une ligue et inviter": a name, then the league is made and its invite
 * link goes out through the phone's share sheet (WhatsApp and the rest), with
 * WhatsApp and "copy the link" as their own buttons where there is no sheet.
 *
 * The league and its code are the ones `/fantasy/leagues` makes, and the link
 * is the one Pronostics uses: one league serves both games. A refusal until
 * the one-time code is in is said once, as the leagues page says it.
 */
export function CreateLeagueInvite() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { key } = useFantasyDataSource();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ name: string; code: string } | null>(null);

  const create = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3 || busy) return;
    setBusy(true);
    try {
      const league = await fantasyService.createLeague(trimmed);
      await qc.invalidateQueries({ queryKey: key("leagues", "private") });
      if (league.code) setCreated({ name: trimmed, code: league.code });
      else toast.success(t("fantasy.leagues.created"));
      setName("");
    } catch (error) {
      if (isMfaStepUpError(error)) showStepUpNotice(t);
      else toast.error(t("state.error"));
    } finally {
      setBusy(false);
    }
  };

  const link = created ? leagueInviteLink(created.code, undefined, "fantasy") : "";
  const message = created ? inviteMessage(t("fantasy.hub.invite_message"), created.name, link) : "";

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

  if (!open) {
    return (
      <UiButton variant="gradient" size="sm" className="mt-3" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden />
        {t("fantasy.hub.create_invite")}
      </UiButton>
    );
  }

  return (
    <UiCard padding="md" className="mt-3">
      {created ? (
        <div className="grid gap-3" data-testid="league-invite-ready">
          <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
            {t("fantasy.hub.invite_ready").replace("{name}", created.name)}
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <UiButton size="sm" onClick={() => void share()}>
              <Share2 className="h-4 w-4" aria-hidden />
              {t("fantasy.hub.invite_share")}
            </UiButton>
            <a
              href={whatsappUrl(message)}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex min-h-[var(--ui-row-min)] items-center justify-center gap-2 px-4",
                ui.radius.full,
                ui.surface.sunken,
                ui.text.bodyStrong,
                ui.focus,
              )}
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              {t("fantasy.hub.invite_whatsapp")}
            </a>
            <UiButton size="sm" variant="soft" onClick={() => void copy()}>
              <Link2 className="h-4 w-4" aria-hidden />
              {t("fantasy.hub.invite_copy")}
            </UiButton>
          </div>
        </div>
      ) : (
        <form
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
          <UiButton type="submit" className="mt-3" disabled={name.trim().length < 3 || busy}>
            {busy ? t("fpl.saving") : t("fantasy.hub.create_invite")}
          </UiButton>
        </form>
      )}
    </UiCard>
  );
}
