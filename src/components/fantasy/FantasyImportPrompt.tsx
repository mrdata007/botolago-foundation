// Pass 3.2-H3 — Reusable empty-cloud import prompt.
//
// Mounted once by the /fantasy layout. Renders only when
// `isImportPromptEligible(...)` is true against the authoritative cloud
// snapshot. Never mounts in local/guest mode.
//
// Actions:
//   Save   → runFantasyImport (via importLocalTeamToCloud) → markImported on success.
//   New    → markStartNew (no cloud write) → close.
//   Later  → close only; no persistent marker.
//
// Failure modes (mapping/network/RLS/conflict/validation/gameweek_unresolved)
// keep local state intact and never mark the UID.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { useI18n } from "@/i18n/provider";
import { AUTH_MODE } from "@/services/auth";
import { useAuth } from "@/auth/AuthProvider";
import { fantasyService } from "@/services/fantasy-runtime";
import { validateTeam } from "@/lib/team-validation";
import type { FantasyPlayer, FantasyTeam } from "@/types/fantasy";
import { importDecisionService, isImportPromptEligible } from "@/services/fantasy-import-decision";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { runOwnedMutation, classifyRepoError } from "@/services/fantasy-mutation-controller";
import { LocalFantasyRepository, DEFAULT_SEASON } from "@/services/fantasy-owned-repository";
import { importLocalTeamToCloud } from "@/services/fantasy-import-service";
import { loadGameweekIndex } from "@/services/fantasy-gameweek-resolver";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

type Phase = "idle" | "saving" | "success" | "error";

interface LocalPayload {
  team: FantasyTeam;
  players: FantasyPlayer[];
  isValid: boolean;
}

export function FantasyImportPrompt() {
  const { t, dir } = useI18n();
  const { user, status } = useAuth();
  const owned = useFantasyOwned();
  const qc = useQueryClient();
  const nav = useNavigate();

  const isAuthenticated = status === "authenticated" && !!user?.id;
  const uid = user?.id ?? null;

  const [local, setLocal] = useState<LocalPayload | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingIds, setMissingIds] = useState<string[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Preview the local team for eligibility gating only. The authoritative
  // import source at save-time is a fresh LocalFantasyRepository snapshot
  // consumed inside the injected service (never the mock service directly).
  useEffect(() => {
    let cancelled = false;
    if (owned.source !== "cloud" || !isAuthenticated) return;
    if (!owned.snapshot?.emptyCloudSquad) return;
    if (importDecisionService.get(uid ?? "") !== null) return;
    (async () => {
      const [team, players] = await Promise.all([
        fantasyService.getTeam(),
        fantasyService.getPlayers(),
      ]);
      if (cancelled) return;
      const isValid =
        team.squad.length === 15 && validateTeam(team.squad, team.formation, players).ok === true;
      setLocal({ team, players, isValid });
    })();
    return () => {
      cancelled = true;
    };
  }, [owned.source, owned.snapshot?.emptyCloudSquad, isAuthenticated, uid]);

  const eligible = useMemo(
    () =>
      isImportPromptEligible({
        authMode: AUTH_MODE,
        isAuthenticated,
        uid,
        emptyCloudSquad: !!owned.snapshot?.emptyCloudSquad,
        localSquadSize: local?.team.squad.length ?? 0,
        localTeamValid: !!local?.isValid,
      }),
    [isAuthenticated, uid, owned.snapshot?.emptyCloudSquad, local],
  );

  if (!eligible || dismissed || !local || !uid) return null;

  const importNow = async () => {
    setPhase("saving");
    setErrorMessage(null);
    setMissingIds(null);

    // Fresh repositories: injected here so runOwnedMutation's `action` is a
    // pure closure the service can be stubbed against in tests.
    const localRepo = new LocalFantasyRepository();
    const defaultTeamName = t("fantasy.default.team_name");

    const res = await runOwnedMutation(
      {
        qc,
        scope: owned.scope,
        setMutationStatus: owned.setMutationStatus,
        nextMutationSeq: owned.nextMutationSeq,
        setMutationStatusIfCurrent: owned.setMutationStatusIfCurrent,
        replaceSnapshot: owned.replaceSnapshot,
        invalidateOwned: owned.invalidateOwned,
      },
      {
        action: () =>
          importLocalTeamToCloud({
            localRepo,
            cloudRepo: owned.repo,
            loadPlayers: () => fantasyService.getPlayers(),
            loadGameweekIndex: () => loadGameweekIndex(supabase),
            season: DEFAULT_SEASON,
            defaultTeamName,
            cloudExpectedVersion: owned.snapshot?.version ?? 0,
          }),
        args: undefined,
        savedIdleAfterMs: 2400,
      },
    );
    if (res.ok) {
      importDecisionService.markImported(uid);
      setPhase("success");
      setTimeout(() => setDismissed(true), 1500);
      return;
    }
    // Failure: NO marker persisted; local state untouched.
    const c = classifyRepoError(res.error);
    setPhase("error");
    if (c.isMapping && res.error.missingIds?.players?.length) {
      setMissingIds(res.error.missingIds.players);
      setErrorMessage(null);
    } else if (c.isNetwork) {
      setErrorMessage(t("fantasy.error.network"));
    } else if (c.isPermission) {
      setErrorMessage(t("fantasy.error.permission"));
    } else if (c.isConflict) {
      setErrorMessage(t("fantasy.error.version_conflict"));
    } else if (c.isValidation) {
      setErrorMessage(t("fantasy.error.import_validation"));
    } else if (res.error.code === "gameweek_unresolved") {
      setErrorMessage(t("fantasy.error.gameweek_unresolved"));
    } else {
      setErrorMessage(t("fantasy.error.import_generic"));
    }
  };

  const startNew = () => {
    importDecisionService.markStartNew(uid);
    setDismissed(true);
    void nav({ to: "/fantasy/create" });
  };

  const later = () => {
    setDismissed(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="botolago-import-title"
      dir={dir}
      className="glass-surface glass-regular mx-3 my-3 rounded-2xl border border-[var(--glass-border)] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="botolago-import-title" className="text-sm font-black text-brand">
            {t("fantasy.import.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground break-words whitespace-normal">
            {t("fantasy.import.subtitle")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("fantasy.import.cta_later")}
          onClick={later}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-white/40"
          disabled={phase === "saving"}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div role="status" aria-live="polite" className="mt-2 min-h-[1.25rem] text-[11px]">
        {phase === "saving" && (
          <span className="text-muted-foreground">{t("fantasy.status.saving")}</span>
        )}
        {phase === "success" && (
          <span className="text-emerald-700">{t("fantasy.import.success")}</span>
        )}
        {phase === "error" && errorMessage && (
          <span className="text-red-700 break-words whitespace-normal">{errorMessage}</span>
        )}
        {phase === "error" && missingIds && missingIds.length > 0 && (
          <span className="text-red-700 break-words whitespace-normal">
            {t("fantasy.import.mapping_gaps").replace("{ids}", missingIds.join(", "))}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={importNow}
          disabled={phase === "saving" || phase === "success"}
          className="min-h-11 flex-1 rounded-xl bg-[color:var(--brand-primary)] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
        >
          {t("fantasy.import.cta_save")}
        </button>
        <button
          type="button"
          onClick={startNew}
          disabled={phase === "saving"}
          className="min-h-11 flex-1 rounded-xl border border-input bg-white/60 px-3 py-2 text-xs font-bold text-foreground hover:bg-white disabled:opacity-40"
        >
          {t("fantasy.import.cta_start_new")}
        </button>
        <button
          type="button"
          onClick={later}
          disabled={phase === "saving"}
          className="min-h-11 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-white/40 disabled:opacity-40"
        >
          {t("fantasy.import.cta_later")}
        </button>
      </div>
    </div>
  );
}
