import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { footballService } from "@/services/football";
import {
  adaptFantasyRules,
  computeSummary,
  initCreateDraft,
  reconcileCreateDraft,
  validateDraft,
  validateTeamName,
  type CreateTeamDraft,
  type CreateTeamRules,
  type DraftSummary,
  type DraftValidation,
} from "@/services/fantasy-create-service";
import { fantasyDraftsStore, type FantasyDraftKey } from "@/services/fantasy-drafts-store";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import type { Club, Gameweek } from "@/types/domain";
import type { FantasyPlayer, FixtureDifficulty } from "@/types/fantasy";

const LEGACY_GUEST_KEY: FantasyDraftKey = {
  uid: "__guest__",
  teamId: "new",
  baseVersion: 0,
  kind: "create-team",
};

export type AtlasCreateStatus = "loading" | "ready" | "unavailable";

export interface AtlasCreateContextValue {
  status: AtlasCreateStatus;
  unavailableReason: "catalog" | "clubs" | "rules" | "gameweek" | null;
  draft: CreateTeamDraft;
  players: FantasyPlayer[];
  clubs: Club[];
  rules: CreateTeamRules | null;
  gameweek: Gameweek | null;
  fixtures: FixtureDifficulty[];
  fixturesUnavailable: boolean;
  summary: DraftSummary | null;
  validation: DraftValidation | null;
  identityValid: boolean;
  commit: (next: CreateTeamDraft | ((current: CreateTeamDraft) => CreateTeamDraft)) => void;
  draftKey: FantasyDraftKey | null;
}

const AtlasCreateContext = createContext<AtlasCreateContextValue | null>(null);

export function AtlasCreateProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const { user, status: authStatus } = useAuth();
  const owned = useFantasyOwned();
  const playersQ = useQuery({
    queryKey: ["fantasy-create", "players"],
    queryFn: () => fantasyService.getPlayers(),
    retry: 1,
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
    retry: 1,
  });
  const rulesQ = useQuery({
    queryKey: ["fantasy-create", "rules"],
    queryFn: () => fantasyService.getRules(),
    retry: 1,
  });
  const gameweekQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    retry: 1,
  });
  const fixturesQ = useQuery({
    queryKey: ["fantasy-create", "fixtures"],
    queryFn: () => fantasyService.getFixtureDifficulty(),
    retry: 1,
  });

  const rules = useMemo(() => (rulesQ.data ? adaptFantasyRules(rulesQ.data) : null), [rulesQ.data]);
  const players = useMemo(() => playersQ.data ?? [], [playersQ.data]);
  const clubs = useMemo(() => clubsQ.data ?? [], [clubsQ.data]);
  // A creation draft is always scoped to the pre-persistence identity. Keeping
  // this key at new/0 prevents the authoritative post-save snapshot from
  // re-keying the provider and unmounting the success confirmation.
  const draftKey = useMemo<FantasyDraftKey | null>(() => {
    if (authStatus === "loading") return null;
    if (authStatus !== "authenticated" || !user?.id) return LEGACY_GUEST_KEY;
    return {
      uid: user.id,
      teamId: "new",
      baseVersion: 0,
      kind: "create-team",
    };
  }, [authStatus, user?.id]);

  const [draft, setDraft] = useState<CreateTeamDraft>(() => initCreateDraft());
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const currentKey = draftKey
    ? `${draftKey.uid}:${draftKey.teamId}:${draftKey.baseVersion}:${draftKey.kind}`
    : null;
  const persistedRef = useRef<string | null>(null);

  const dataReady =
    !!rules &&
    players.length > 0 &&
    clubs.length > 0 &&
    !!gameweekQ.data &&
    !playersQ.isPending &&
    !clubsQ.isPending &&
    !rulesQ.isPending &&
    !gameweekQ.isPending;

  useEffect(() => {
    if (!dataReady || !draftKey || !currentKey || hydratedKey === currentKey) return;
    let entry = fantasyDraftsStore.read<CreateTeamDraft>(draftKey);
    if (!entry) {
      const legacy = fantasyDraftsStore.read<CreateTeamDraft>(LEGACY_GUEST_KEY);
      if (legacy) {
        fantasyDraftsStore.save(draftKey, legacy.payload);
        fantasyDraftsStore.remove(LEGACY_GUEST_KEY);
        entry = fantasyDraftsStore.read<CreateTeamDraft>(draftKey);
      }
    }
    const firstName = user?.displayName?.trim().split(/\s+/)[0] ?? "";
    const defaultName = firstName ? `${firstName} Atlas` : "";
    const next = reconcileCreateDraft(entry?.payload, players, clubs, rules, {
      teamName: defaultName,
      favoriteClubId: user?.favoriteClubId ?? null,
    });
    setDraft(next);
    persistedRef.current = JSON.stringify(next);
    setHydratedKey(currentKey);
  }, [
    clubs,
    currentKey,
    dataReady,
    draftKey,
    hydratedKey,
    players,
    rules,
    user?.displayName,
    user?.favoriteClubId,
  ]);

  useEffect(() => {
    if (!draftKey || !currentKey || hydratedKey !== currentKey) return;
    const serialized = JSON.stringify(draft);
    if (serialized === persistedRef.current) return;
    fantasyDraftsStore.save(draftKey, draft);
    persistedRef.current = serialized;
  }, [currentKey, draft, draftKey, hydratedKey]);

  const commit = useCallback<AtlasCreateContextValue["commit"]>((next) => {
    setDraft((current) => (typeof next === "function" ? next(current) : next));
  }, []);

  const queriesPending =
    authStatus === "loading" ||
    (owned.source === "cloud" && owned.isLoading) ||
    playersQ.isPending ||
    clubsQ.isPending ||
    rulesQ.isPending ||
    gameweekQ.isPending ||
    !currentKey ||
    hydratedKey !== currentKey;
  const unavailableReason =
    playersQ.isError || (!playersQ.isPending && players.length === 0)
      ? "catalog"
      : clubsQ.isError || (!clubsQ.isPending && clubs.length === 0)
        ? "clubs"
        : rulesQ.isError || (!rulesQ.isPending && !rules)
          ? "rules"
          : gameweekQ.isError || (!gameweekQ.isPending && !gameweekQ.data)
            ? "gameweek"
            : null;
  const status: AtlasCreateStatus = unavailableReason
    ? "unavailable"
    : queriesPending
      ? "loading"
      : "ready";
  const summary = rules ? computeSummary(draft, players, rules) : null;
  const validation = rules ? validateDraft(draft, players, rules) : null;
  const identityValid = validateTeamName(draft.teamName).ok && draft.consentAccepted;

  const value = useMemo<AtlasCreateContextValue>(
    () => ({
      status,
      unavailableReason,
      draft,
      players,
      clubs,
      rules,
      gameweek: gameweekQ.data ?? null,
      fixtures: fixturesQ.data ?? [],
      fixturesUnavailable: fixturesQ.isError,
      summary,
      validation,
      identityValid,
      commit,
      draftKey,
    }),
    [
      status,
      unavailableReason,
      draft,
      players,
      clubs,
      rules,
      gameweekQ.data,
      fixturesQ.data,
      fixturesQ.isError,
      summary,
      validation,
      identityValid,
      commit,
      draftKey,
    ],
  );

  return <AtlasCreateContext.Provider value={value}>{children}</AtlasCreateContext.Provider>;
}

export function useAtlasCreate(): AtlasCreateContextValue {
  const value = useContext(AtlasCreateContext);
  if (!value) throw new Error("useAtlasCreate must be used inside AtlasCreateProvider");
  return value;
}
