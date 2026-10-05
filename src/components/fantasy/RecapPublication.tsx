import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Globe, Link2Off } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { showStepUpNotice } from "@/auth/step-up-notice";
import { isMfaStepUpError } from "@/backend/auth/step-up";
import type { FantasyMyRecapPublicationDto } from "@/backend/fantasy/contracts";
import { mapFantasyError } from "@/backend/fantasy/errors";
import { ui, UiButton, UiInput } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { publicRecapUrl } from "@/lib/public-recap";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { fantasyService } from "@/services/fantasy-runtime";

const ALIAS_MIN = 2;
const ALIAS_MAX = 40;

/**
 * Fantasy R4 — the owner's control for a public link to one finalized
 * gameweek's recap. Hidden while publishing is switched off server-side and
 * nothing is published. Publishing is explicit: the manager reads what will be
 * public, chooses the alias shown, and taps. Revoking takes a second tap and
 * says what it cannot undo (copies already downloaded elsewhere).
 *
 * `onPublication` hands the live public id up, so the share sheet can share
 * the public page instead of the generic Fantasy link.
 */
export function RecapPublication({
  gameweek,
  defaultAlias,
  onPublication,
}: {
  gameweek: number;
  defaultAlias: string;
  onPublication?: (publicId: string | null) => void;
}) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { key } = useFantasyDataSource();
  const queryKey = key("recap-publication", gameweek);
  const [alias, setAlias] = useState(defaultAlias);
  const [aliasInvalid, setAliasInvalid] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const stateQ = useQuery({
    queryKey,
    queryFn: () => fantasyService.getMyRecapPublication(gameweek),
    retry: 1,
  });
  const livePublicId = stateQ.data?.publication?.publicId ?? null;
  useEffect(() => {
    onPublication?.(livePublicId);
    // `onPublication` is the parent's setter; only the id decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePublicId]);

  const failed = (error: unknown) => {
    if (isMfaStepUpError(error)) return showStepUpNotice(t);
    const code = mapFantasyError(error).code;
    if (code === "public_recap_alias_invalid") setAliasInvalid(true);
    else toast.error(t("state.error"));
  };

  const publish = useMutation({
    mutationFn: (value: string) => fantasyService.publishRecap(gameweek, value),
    onSuccess: (publication) => {
      track("fantasy_recap_public_publish");
      qc.setQueryData<FantasyMyRecapPublicationDto>(queryKey, {
        publishEnabled: true,
        publication,
      });
    },
    onError: failed,
  });
  const revoke = useMutation({
    mutationFn: (publicId: string) => fantasyService.revokeRecap(publicId),
    onSuccess: () => {
      track("fantasy_recap_public_revoke");
      setConfirmRevoke(false);
      qc.setQueryData<FantasyMyRecapPublicationDto>(queryKey, (previous) => ({
        publishEnabled: previous?.publishEnabled ?? false,
        publication: null,
      }));
      toast.success(t("fantasy.recap.public.revoked"));
    },
    onError: failed,
  });

  const state = stateQ.data;
  if (!state || (!state.publishEnabled && !state.publication)) return null;

  const publication = state.publication;
  if (publication) {
    const url = publicRecapUrl(publication.publicId, lang);
    return (
      <div
        className={cn("mt-4 grid gap-2 border-t pt-4", ui.rule.block)}
        data-testid="recap-publication-live"
      >
        <p className={cn("flex items-center gap-2", ui.text.bodyStrong, ui.tone.default)}>
          <Globe className="h-4 w-4" aria-hidden />
          {t("fantasy.recap.public.live")}
        </p>
        <p dir="ltr" className={cn("break-all", ui.text.meta, ui.tone.muted)}>
          {url}
        </p>
        <div className="flex flex-wrap gap-2">
          <UiButton
            variant="soft"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                toast.success(t("article.share_copied"));
              } catch {
                toast.error(t("pepites.share.copy_failed"));
              }
            }}
          >
            <Copy className="h-4 w-4" aria-hidden />
            {t("fantasy.recap.public.copy")}
          </UiButton>
          <UiButton
            variant={confirmRevoke ? "ink" : "soft"}
            size="sm"
            disabled={revoke.isPending}
            onClick={() =>
              confirmRevoke ? revoke.mutate(publication.publicId) : setConfirmRevoke(true)
            }
          >
            <Link2Off className="h-4 w-4" aria-hidden />
            {confirmRevoke
              ? t("fantasy.recap.public.revoke_confirm")
              : t("fantasy.recap.public.revoke")}
          </UiButton>
        </div>
        <p className={cn(ui.text.micro, ui.tone.muted)}>{t("fantasy.recap.public.revoke_note")}</p>
      </div>
    );
  }

  const trimmed = alias.trim();
  const valid = trimmed.length >= ALIAS_MIN && trimmed.length <= ALIAS_MAX;
  return (
    <form
      className={cn("mt-4 grid gap-2 border-t pt-4", ui.rule.block)}
      data-testid="recap-publication-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return setAliasInvalid(true);
        if (publish.isPending) return;
        setAliasInvalid(false);
        publish.mutate(trimmed);
      }}
    >
      <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("fantasy.recap.public.title")}</p>
      <p className={cn(ui.text.meta, ui.tone.muted)}>{t("fantasy.recap.public.explain")}</p>
      <UiInput
        dir="auto"
        value={alias}
        maxLength={ALIAS_MAX}
        onChange={(event) => {
          setAlias(event.target.value);
          setAliasInvalid(false);
        }}
        aria-label={t("fantasy.recap.public.alias")}
        placeholder={t("fantasy.recap.public.alias")}
        error={aliasInvalid ? t("fantasy.recap.public.alias_invalid") : undefined}
      />
      <UiButton type="submit" variant="ink" size="sm" disabled={publish.isPending}>
        <Globe className="h-4 w-4" aria-hidden />
        {t("fantasy.recap.public.publish")}
      </UiButton>
    </form>
  );
}
