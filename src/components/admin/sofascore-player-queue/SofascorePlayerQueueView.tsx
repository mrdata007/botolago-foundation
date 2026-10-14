import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type {
  AliasResult,
  CreatePlayerInput,
  CreateResult,
  LinkOption,
  LinkOptions,
  ParsedQueue,
  QueueCandidate,
  QueueEntry,
  QueuePosition,
  ResolveResult,
} from "@/backend/football/identity/sofascore-player-queue";
import {
  QUEUE_POSITIONS,
  linkOptionAction,
  mapSofascoreQueueError,
} from "@/backend/football/identity/sofascore-player-queue";
import {
  ADMIN_CARD_CLASS,
  ADMIN_PANEL_CLASS,
  AdminBadge,
  AdminDatum,
  AdminEmptyState,
  AdminNotice,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { formatUtc } from "@/components/admin/player-mappings/format";
import { Fact, NameText } from "@/components/admin/player-mappings/parts";
import { ui, UiButton, UiInput, UiSelect } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import {
  getSofascoreQueueCopy,
  reasonCopy,
  sofascoreQueueErrorMessage,
  type Lang,
  type SofascoreQueueCopy,
} from "./copy";

export type QueueLoadState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly code: string }
  | { readonly status: "ready"; readonly data: ParsedQueue; readonly version?: number };

/** One pending confirmation: link (the ordinary way) or link as a second id. */
type Confirming = {
  readonly sofascorePlayerId: string;
  readonly playerId: string;
  readonly kind?: "link" | "alias";
  /** Where the button was: the offered candidates or the search results. */
  readonly from?: "candidates" | "search";
};

type OpenPanel = { readonly sofascorePlayerId: string; readonly panel: "search" | "create" };

type SearchState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly options: LinkOptions };

export interface SofascorePlayerQueueViewProps {
  readonly lang: Lang;
  readonly state: QueueLoadState;
  /** Draws the write controls. The database still decides whether a call is allowed. */
  readonly canManage: boolean;
  readonly onReload: () => void;
  readonly resolve: (sofascorePlayerId: string, playerId: string) => Promise<ResolveResult>;
  /** "Link as second ID". Without it, that action is not drawn. */
  readonly linkAlias?: (sofascorePlayerId: string, playerId: string) => Promise<AliasResult>;
  /** "Create this player". Without it, that action is not drawn. */
  readonly createPlayer?: (
    sofascorePlayerId: string,
    input: CreatePlayerInput,
  ) => Promise<CreateResult>;
  /** The search. Without it, "find another player" is not drawn. */
  readonly listOptions?: (sofascorePlayerId: string, query?: string) => Promise<LinkOptions>;
  /** A starting point, for a static render and for tests. */
  readonly initial?: {
    readonly confirming?: Confirming;
    readonly notice?: string;
    readonly entryErrors?: Readonly<Record<string, string>>;
    readonly panel?: OpenPanel;
    readonly options?: LinkOptions;
  };
}

const candidateLabel = (
  c: { displayName: string | null; fullName: string | null },
  copy: SofascoreQueueCopy,
) => c.displayName ?? c.fullName ?? copy.candidates.unnamed;

/**
 * The list of SofaScore players the matcher held, and what staff can do on each:
 * confirm an offered candidate, find any catalog player and link him (or link the
 * id as his second SofaScore id), or create the player from SofaScore. It holds
 * only what the reader is doing (one pending confirmation, one open panel, the
 * sentences to show); every fact comes from the repository.
 */
export function SofascorePlayerQueueView({
  lang,
  state,
  canManage,
  onReload,
  resolve,
  linkAlias,
  createPlayer,
  listOptions,
  initial,
}: SofascorePlayerQueueViewProps) {
  const copy = getSofascoreQueueCopy(lang);
  // The reply to a confirmation can come after the language changed: word it in the current one.
  const latestCopy = useRef(copy);
  latestCopy.current = copy;
  const [confirming, setConfirming] = useState<Confirming | null>(initial?.confirming ?? null);
  const [panel, setPanel] = useState<OpenPanel | null>(initial?.panel ?? null);
  const [search, setSearch] = useState<SearchState>(
    initial?.options ? { status: "ready", options: initial.options } : { status: "idle" },
  );
  const searchSeq = useRef(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(initial?.notice ?? null);
  const [entryErrors, setEntryErrors] = useState<Readonly<Record<string, string>>>(
    initial?.entryErrors ?? {},
  );
  // Done in this session: gone from the list at once, without waiting for a reload.
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());

  // A fresh list from the server replaces what was done locally.
  const version = state.status === "ready" ? state.version : undefined;
  const [seenVersion, setSeenVersion] = useState(version);
  if (seenVersion !== version) {
    setSeenVersion(version);
    setDone(new Set());
    setEntryErrors({});
    setConfirming(null);
    setPanel(null);
    setSearch({ status: "idle" });
  }
  // Sentences already shown were written in the language of their moment: drop them on a switch.
  const [seenLang, setSeenLang] = useState(lang);
  if (seenLang !== lang) {
    setSeenLang(lang);
    setNotice(null);
    setEntryErrors({});
    if (search.status === "error") setSearch({ status: "idle" });
  }

  const entries = useMemo(
    () =>
      state.status === "ready"
        ? state.data.entries.filter((e) => !done.has(e.sofascorePlayerId))
        : [],
    [state, done],
  );

  const clearError = (id: string) =>
    setEntryErrors((current) => {
      const { [id]: _dropped, ...rest } = current;
      return rest;
    });

  /** Runs one write; on success the card leaves the list and `sentence` is announced. */
  const run = async (entry: QueueEntry, write: () => Promise<string>) => {
    if (busy || !canManage) return;
    setBusy(true);
    setNotice(null);
    clearError(entry.sofascorePlayerId);
    try {
      const sentence = await write();
      setDone((current) => new Set(current).add(entry.sofascorePlayerId));
      setConfirming(null);
      setPanel(null);
      setSearch({ status: "idle" });
      setNotice(sentence);
    } catch (error) {
      setConfirming(null);
      setEntryErrors((current) => ({
        ...current,
        [entry.sofascorePlayerId]: sofascoreQueueErrorMessage(
          latestCopy.current,
          mapSofascoreQueueError(error).code,
        ),
      }));
    } finally {
      setBusy(false);
    }
  };

  const confirm = (
    entry: QueueEntry,
    player: { playerId: string; displayName: string | null; fullName: string | null },
    kind: "link" | "alias",
  ) =>
    run(entry, async () => {
      const words = latestCopy.current;
      const name = candidateLabel(player, words);
      if (kind === "alias") {
        if (!linkAlias) throw new Error("link as second id is not available");
        const result = await linkAlias(entry.sofascorePlayerId, player.playerId);
        return result.alreadyLinked
          ? words.alreadyDone(entry.name)
          : words.doneAlias(entry.name, name);
      }
      const result = await resolve(entry.sofascorePlayerId, player.playerId);
      return result.alreadyResolved ? words.alreadyDone(entry.name) : words.done(entry.name, name);
    });

  const create = (entry: QueueEntry, input: CreatePlayerInput) =>
    run(entry, async () => {
      if (!createPlayer) throw new Error("create is not available");
      await createPlayer(entry.sofascorePlayerId, input);
      return latestCopy.current.doneCreate(input.name ?? entry.name);
    });

  const loadOptions = async (entry: QueueEntry, query?: string) => {
    if (!listOptions) return;
    const seq = ++searchSeq.current;
    setSearch({ status: "loading" });
    try {
      const options = await listOptions(entry.sofascorePlayerId, query);
      if (seq === searchSeq.current) setSearch({ status: "ready", options });
    } catch (error) {
      if (seq === searchSeq.current)
        setSearch({
          status: "error",
          message: sofascoreQueueErrorMessage(
            latestCopy.current,
            mapSofascoreQueueError(error).code,
          ),
        });
    }
  };

  const togglePanel = (entry: QueueEntry, which: "search" | "create") => {
    const open = panel?.sofascorePlayerId === entry.sofascorePlayerId && panel.panel === which;
    setConfirming(null);
    if (open) {
      setPanel(null);
      setSearch({ status: "idle" });
      return;
    }
    setPanel({ sofascorePlayerId: entry.sofascorePlayerId, panel: which });
    if (which === "search") void loadOptions(entry);
    else setSearch({ status: "idle" });
  };

  const body = (() => {
    if (state.status === "loading")
      return (
        <div data-testid="sofascore-queue-loading" role="status" aria-live="polite">
          <p className={cn("mb-3", ui.text.secondary, ui.tone.muted)}>{copy.loading}</p>
          <AdminSkeletonList rows={3} surface="card" />
        </div>
      );
    if (state.status === "error")
      return (
        <div className="grid gap-3" data-testid="sofascore-queue-error">
          <AdminNotice tone="alert" role="alert">
            {copy.loadFailed} {sofascoreQueueErrorMessage(copy, state.code)}
          </AdminNotice>
          <div>
            <UiButton
              size="sm"
              className="w-full sm:w-auto"
              onClick={onReload}
              data-testid="sofascore-queue-retry"
            >
              {copy.retry}
            </UiButton>
          </div>
        </div>
      );
    return (
      <>
        {state.data.skipped > 0 && (
          <div data-testid="sofascore-queue-skipped">
            <AdminNotice tone="alert" role="status">
              {copy.skipped(state.data.skipped)}
            </AdminNotice>
          </div>
        )}
        {entries.length === 0 ? (
          <AdminEmptyState testId="sofascore-queue-empty">{copy.empty}</AdminEmptyState>
        ) : (
          <ul className="grid gap-4" data-testid="sofascore-queue-list">
            {entries.map((entry) => {
              const mine = panel?.sofascorePlayerId === entry.sofascorePlayerId;
              return (
                <EntryCard
                  key={entry.sofascorePlayerId}
                  entry={entry}
                  copy={copy}
                  canManage={canManage}
                  busy={busy}
                  confirming={
                    confirming?.sofascorePlayerId === entry.sofascorePlayerId ? confirming : null
                  }
                  error={entryErrors[entry.sofascorePlayerId] ?? null}
                  canAlias={Boolean(linkAlias)}
                  canSearch={Boolean(listOptions)}
                  canCreatePlayer={Boolean(createPlayer)}
                  panel={mine ? panel.panel : null}
                  search={mine ? search : { status: "idle" }}
                  onAsk={(playerId, kind, from) =>
                    setConfirming({
                      sofascorePlayerId: entry.sofascorePlayerId,
                      playerId,
                      kind,
                      from,
                    })
                  }
                  onCancel={() => setConfirming(null)}
                  onConfirm={(player, kind) => void confirm(entry, player, kind)}
                  onTogglePanel={(which) => togglePanel(entry, which)}
                  onSearch={(query) => void loadOptions(entry, query)}
                  onCreate={(input) => void create(entry, input)}
                />
              );
            })}
          </ul>
        )}
      </>
    );
  })();

  return (
    <section
      dir={copy.dir}
      lang={lang}
      className="grid gap-4"
      data-testid="sofascore-queue"
      data-direction={copy.dir}
    >
      <header className="grid gap-3">
        <p className={cn("max-w-prose", ui.text.secondary, ui.tone.muted)}>{copy.intro}</p>
        {!canManage && (
          <div data-testid="sofascore-queue-reader-notice">
            <AdminNotice tone="info" role="status">
              {copy.readerNotice}
            </AdminNotice>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className={cn(ui.text.bodyStrong, ui.tone.default)}
            data-testid="sofascore-queue-count"
          >
            {state.status === "ready" ? copy.count(entries.length) : ""}
          </p>
          <UiButton
            size="sm"
            variant="outline"
            onClick={onReload}
            disabled={state.status === "loading" || busy}
            data-testid="sofascore-queue-refresh"
          >
            {copy.refresh}
          </UiButton>
        </div>
      </header>
      {notice && (
        <div data-testid="sofascore-queue-notice">
          <AdminNotice tone="info" role="status">
            {notice}
          </AdminNotice>
        </div>
      )}
      {body}
    </section>
  );
}

type PlayerRef = { playerId: string; displayName: string | null; fullName: string | null };

function EntryCard({
  entry,
  copy,
  canManage,
  busy,
  confirming,
  error,
  canAlias,
  canSearch,
  canCreatePlayer,
  panel,
  search,
  onAsk,
  onCancel,
  onConfirm,
  onTogglePanel,
  onSearch,
  onCreate,
}: {
  entry: QueueEntry;
  copy: SofascoreQueueCopy;
  canManage: boolean;
  busy: boolean;
  confirming: Confirming | null;
  error: string | null;
  canAlias: boolean;
  canSearch: boolean;
  canCreatePlayer: boolean;
  panel: "search" | "create" | null;
  search: SearchState;
  onAsk: (playerId: string, kind: "link" | "alias", from: "candidates" | "search") => void;
  onCancel: () => void;
  onConfirm: (player: PlayerRef, kind: "link" | "alias") => void;
  onTogglePanel: (which: "search" | "create") => void;
  onSearch: (query?: string) => void;
  onCreate: (input: CreatePlayerInput) => void;
}) {
  const reason = reasonCopy(copy, entry.reason);
  const headingId = `sofascore-entry-${entry.sofascorePlayerId}-title`;
  const f = copy.facts;
  const showMore = canManage && (canSearch || canCreatePlayer);
  return (
    <li
      className={cn(ADMIN_CARD_CLASS, "grid min-w-0 gap-4 p-4")}
      aria-labelledby={headingId}
      data-testid="sofascore-queue-entry"
      data-entry-id={entry.sofascorePlayerId}
      data-reason={entry.reason}
    >
      <div className="grid min-w-0 gap-2">
        <h3 id={headingId} className={cn("min-w-0", ui.text.subtitle, ui.tone.default)}>
          <NameText>{entry.name}</NameText>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {entry.position && <AdminBadge>{copy.positions[entry.position]}</AdminBadge>}
          {entry.side && <AdminBadge>{entry.side === "home" ? f.home : f.away}</AdminBadge>}
        </div>
      </div>

      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Fact label={f.club}>
          {entry.teamName ? <NameText>{entry.teamName}</NameText> : f.noClub}
        </Fact>
        <Fact label={f.shirt}>
          {entry.shirtNumber !== null ? (
            <AdminDatum mono={false}>{entry.shirtNumber}</AdminDatum>
          ) : (
            f.noShirt
          )}
        </Fact>
        <Fact label={f.seen}>{f.seenTimes(entry.timesSeen)}</Fact>
        <Fact label={f.sofascoreId}>
          <AdminDatum>{entry.sofascorePlayerId}</AdminDatum>
        </Fact>
        <Fact label={f.firstSeen}>
          <bdi dir="ltr" className="inline-block">
            {formatUtc(entry.firstSeenAt)}
          </bdi>
        </Fact>
        <Fact label={f.lastSeen}>
          <bdi dir="ltr" className="inline-block">
            {formatUtc(entry.lastSeenAt)}
          </bdi>
        </Fact>
      </dl>

      <div className={cn(ADMIN_PANEL_CLASS, "p-3")} data-testid="sofascore-queue-reason">
        <p className={cn(ui.text.label, ui.tone.muted)}>{copy.reasonLabel}</p>
        <p className={cn("mt-1", ui.text.bodyStrong, ui.tone.default)}>{reason.title}</p>
        <p className={cn("mt-1 max-w-prose", ui.text.secondary, ui.tone.muted)}>{reason.body}</p>
      </div>

      {error && (
        <div data-testid="sofascore-queue-entry-error">
          <AdminNotice tone="alert" role="alert">
            {error}
          </AdminNotice>
        </div>
      )}

      {entry.candidates.length === 0 ? (
        <div className="grid gap-1" data-testid="sofascore-queue-no-candidates">
          <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{copy.candidates.none}</p>
          {showMore && (
            <p className={cn("max-w-prose", ui.text.secondary, ui.tone.muted)}>
              {copy.candidates.noneNoButton}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          <p className={cn(ui.text.label, ui.tone.muted)}>
            {copy.candidates.heading(entry.candidates.length)}
          </p>
          <ul className="grid gap-2">
            {entry.candidates.map((candidate) => (
              <CandidateRow
                key={candidate.playerId}
                entry={entry}
                candidate={candidate}
                copy={copy}
                canManage={canManage}
                canAlias={canAlias}
                busy={busy}
                asking={
                  confirming?.from !== "search" && confirming?.playerId === candidate.playerId
                    ? (confirming.kind ?? "link")
                    : null
                }
                onAsk={(kind) => onAsk(candidate.playerId, kind, "candidates")}
                onCancel={onCancel}
                onConfirm={(kind) => onConfirm(candidate, kind)}
              />
            ))}
          </ul>
        </div>
      )}

      {showMore && (
        <div className="grid gap-3" data-testid="sofascore-queue-more">
          <p className={cn(ui.text.label, ui.tone.muted)}>{copy.more.heading}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {canSearch && (
              <UiButton
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onTogglePanel("search")}
                disabled={busy}
                aria-expanded={panel === "search"}
                data-testid="sofascore-search-open"
              >
                {panel === "search" ? copy.search.close : copy.search.open}
              </UiButton>
            )}
            {canCreatePlayer && entry.canCreate && (
              <UiButton
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onTogglePanel("create")}
                disabled={busy}
                aria-expanded={panel === "create"}
                data-testid="sofascore-create-open"
              >
                {copy.create.open}
              </UiButton>
            )}
          </div>
          {canCreatePlayer && !entry.canCreate && (
            <p
              className={cn("max-w-prose", ui.text.secondary, ui.tone.muted)}
              data-testid="sofascore-create-unavailable"
            >
              {copy.more.cannotCreate}
            </p>
          )}
          {panel === "search" && (
            <SearchPanel
              entry={entry}
              copy={copy}
              busy={busy}
              search={search}
              canAlias={canAlias}
              asking={confirming?.from === "search" ? confirming : null}
              onSearch={onSearch}
              onAsk={(playerId, kind) => onAsk(playerId, kind, "search")}
              onCancel={onCancel}
              onConfirm={onConfirm}
            />
          )}
          {panel === "create" && entry.canCreate && (
            <CreatePanel
              entry={entry}
              copy={copy}
              busy={busy}
              onCancel={() => onTogglePanel("create")}
              onCreate={onCreate}
            />
          )}
        </div>
      )}
    </li>
  );
}

/** The confirm step every write goes through: what will happen, then yes or cancel. */
function ConfirmPanel({
  id,
  title,
  prompt,
  consequence,
  yes,
  working,
  cancel,
  busy,
  onConfirm,
  onCancel,
  testId,
}: {
  id: string;
  title: string;
  prompt: string;
  consequence: string;
  yes: string;
  working: string;
  cancel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={id}
      className={cn(
        "grid gap-3 border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-3",
        ui.radius.control,
      )}
      data-testid={testId}
    >
      <p id={id} className={cn(ui.text.bodyStrong, ui.tone.default)}>
        {title}
      </p>
      <p className={cn(ui.text.body, ui.tone.default)}>{prompt}</p>
      <p className={cn(ui.text.secondary, ui.tone.muted)}>{consequence}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <UiButton
          className="w-full sm:w-auto"
          onClick={onConfirm}
          disabled={busy}
          data-testid={`${testId}-yes`}
        >
          {busy ? working : yes}
        </UiButton>
        <UiButton
          variant="outline"
          className="w-full sm:w-auto"
          onClick={onCancel}
          disabled={busy}
          data-testid={`${testId}-cancel`}
        >
          {cancel}
        </UiButton>
      </div>
    </div>
  );
}

function CandidateRow({
  entry,
  candidate,
  copy,
  canManage,
  canAlias,
  busy,
  asking,
  onAsk,
  onCancel,
  onConfirm,
}: {
  entry: QueueEntry;
  candidate: QueueCandidate;
  copy: SofascoreQueueCopy;
  canManage: boolean;
  canAlias: boolean;
  busy: boolean;
  asking: "link" | "alias" | null;
  onAsk: (kind: "link" | "alias") => void;
  onCancel: () => void;
  onConfirm: (kind: "link" | "alias") => void;
}) {
  const f = copy.facts;
  const label = candidateLabel(candidate, copy);
  const locked = candidate.mappedToSofascoreId !== null;
  // A second id needs an active main link; an unknown state is not offered (the database decides anyway).
  const aliasable = canAlias && locked && candidate.mappedActive === true;
  const titleId = `sofascore-confirm-${entry.sofascorePlayerId}-${candidate.playerId}`;
  return (
    <li
      className={cn(ADMIN_PANEL_CLASS, "grid min-w-0 gap-3 p-3")}
      data-testid="sofascore-queue-candidate"
      data-player-id={candidate.playerId}
      data-locked={locked ? "true" : "false"}
    >
      <div className="grid min-w-0 gap-1">
        <p className={cn("min-w-0", ui.text.bodyStrong, ui.tone.default)}>
          <NameText>{label}</NameText>
        </p>
        {candidate.fullName && candidate.fullName !== label && (
          <p className={cn("min-w-0", ui.text.secondary, ui.tone.muted)}>
            <NameText>{candidate.fullName}</NameText>
          </p>
        )}
        <p className={cn(ui.text.secondary, ui.tone.muted)}>
          {candidate.position ? copy.positions[candidate.position] : f.noPosition}
          {" · "}
          {candidate.shirtNumber !== null ? (
            <>
              {f.shirt} <AdminDatum mono={false}>{candidate.shirtNumber}</AdminDatum>
            </>
          ) : (
            f.noShirt
          )}
        </p>
        {candidate.sofascoreAliasIds.length > 0 && (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>
            {copy.search.secondIds(candidate.sofascoreAliasIds.join(", "))}
          </p>
        )}
      </div>

      {locked && (
        <p
          className={cn(ui.text.secondary, ui.tone.default)}
          data-testid="sofascore-queue-candidate-locked"
        >
          {copy.candidates.alreadyMapped(candidate.mappedToSofascoreId ?? "")}
        </p>
      )}
      {!canManage || (locked && !aliasable) ? null : asking === (locked ? "alias" : "link") ? (
        locked ? (
          <ConfirmPanel
            id={titleId}
            title={copy.alias.title}
            prompt={copy.alias.prompt(entry.name, label)}
            consequence={copy.alias.consequence(candidate.mappedToSofascoreId ?? "")}
            yes={copy.alias.yes}
            working={copy.alias.working}
            cancel={copy.confirm.cancel}
            busy={busy}
            onConfirm={() => onConfirm("alias")}
            onCancel={onCancel}
            testId="sofascore-alias-panel"
          />
        ) : (
          <ConfirmPanel
            id={titleId}
            title={copy.confirm.title}
            prompt={copy.confirm.prompt(entry.name, label)}
            consequence={copy.confirm.consequence}
            yes={copy.confirm.yes}
            working={copy.confirm.working}
            cancel={copy.confirm.cancel}
            busy={busy}
            onConfirm={() => onConfirm("link")}
            onCancel={onCancel}
            testId="sofascore-confirm-panel"
          />
        )
      ) : (
        <div>
          <UiButton
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onAsk(locked ? "alias" : "link")}
            disabled={busy}
            aria-label={locked ? copy.alias.openLabel(label) : copy.confirm.openLabel(label)}
            data-testid={locked ? "sofascore-alias-open" : "sofascore-confirm-open"}
          >
            {locked ? copy.alias.open : copy.confirm.open}
          </UiButton>
        </div>
      )}
    </li>
  );
}

function SearchPanel({
  entry,
  copy,
  busy,
  search,
  canAlias,
  asking,
  onSearch,
  onAsk,
  onCancel,
  onConfirm,
}: {
  entry: QueueEntry;
  copy: SofascoreQueueCopy;
  busy: boolean;
  search: SearchState;
  canAlias: boolean;
  asking: Confirming | null;
  onSearch: (query?: string) => void;
  onAsk: (playerId: string, kind: "link" | "alias") => void;
  onCancel: () => void;
  onConfirm: (player: PlayerRef, kind: "link" | "alias") => void;
}) {
  const s = copy.search;
  const [query, setQuery] = useState(search.status === "ready" ? (search.options.query ?? "") : "");
  const [tooShort, setTooShort] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length === 1) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    onSearch(q === "" ? undefined : q);
  };
  const titleId = `sofascore-search-${entry.sofascorePlayerId}-title`;
  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(ADMIN_PANEL_CLASS, "grid min-w-0 gap-3 p-3")}
      data-testid="sofascore-search-panel"
    >
      <p id={titleId} className={cn(ui.text.bodyStrong, ui.tone.default)}>
        {s.title}
      </p>
      <form className="grid gap-2 sm:flex sm:items-end" onSubmit={submit}>
        <UiInput
          label={s.label}
          hint={s.hint}
          error={tooShort ? s.tooShort : undefined}
          type="search"
          maxLength={80}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 sm:flex-1"
          data-testid="sofascore-search-input"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <UiButton
            type="submit"
            size="sm"
            className="w-full sm:w-auto"
            disabled={busy || search.status === "loading"}
            data-testid="sofascore-search-submit"
          >
            {s.submit}
          </UiButton>
          <UiButton
            type="button"
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={busy || search.status === "loading"}
            onClick={() => {
              setQuery("");
              setTooShort(false);
              onSearch(undefined);
            }}
            data-testid="sofascore-search-squad"
          >
            {s.showSquad}
          </UiButton>
        </div>
      </form>
      <div aria-live="polite" className="grid gap-2">
        {search.status === "loading" && (
          <p
            className={cn(ui.text.secondary, ui.tone.muted)}
            data-testid="sofascore-search-loading"
          >
            {s.loading}
          </p>
        )}
        {search.status === "error" && (
          <AdminNotice tone="alert" role="alert">
            {search.message}
          </AdminNotice>
        )}
        {search.status === "ready" && (
          <>
            <p className={cn(ui.text.label, ui.tone.muted)} data-testid="sofascore-search-count">
              {search.options.query === null
                ? s.squadHeading(search.options.players.length)
                : s.resultsHeading(search.options.players.length)}
            </p>
            {search.options.players.length === 0 ? (
              <p className={cn(ui.text.secondary, ui.tone.muted)}>{s.empty}</p>
            ) : (
              <ul className="grid gap-2" data-testid="sofascore-search-results">
                {search.options.players.map((option) => (
                  <OptionRow
                    key={option.playerId}
                    entry={entry}
                    option={option}
                    copy={copy}
                    busy={busy}
                    canAlias={canAlias}
                    asking={asking?.playerId === option.playerId ? (asking.kind ?? "link") : null}
                    onAsk={(kind) => onAsk(option.playerId, kind)}
                    onCancel={onCancel}
                    onConfirm={(kind) => onConfirm(option, kind)}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OptionRow({
  entry,
  option,
  copy,
  busy,
  canAlias,
  asking,
  onAsk,
  onCancel,
  onConfirm,
}: {
  entry: QueueEntry;
  option: LinkOption;
  copy: SofascoreQueueCopy;
  busy: boolean;
  canAlias: boolean;
  asking: "link" | "alias" | null;
  onAsk: (kind: "link" | "alias") => void;
  onCancel: () => void;
  onConfirm: (kind: "link" | "alias") => void;
}) {
  const s = copy.search;
  const f = copy.facts;
  const label = candidateLabel(option, copy);
  const action = linkOptionAction(option);
  const kind: "link" | "alias" | null =
    action === "link" ? "link" : action === "alias" && canAlias ? "alias" : null;
  const titleId = `sofascore-option-${entry.sofascorePlayerId}-${option.playerId}`;
  const facts: ReactNode[] = [
    option.position ? copy.positions[option.position] : f.noPosition,
    option.shirtNumber !== null ? (
      <span key="shirt">
        {f.shirt} <AdminDatum mono={false}>{option.shirtNumber}</AdminDatum>
      </span>
    ) : (
      f.noShirt
    ),
  ];
  return (
    <li
      className={cn(
        "grid min-w-0 gap-2 border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-3",
        ui.radius.control,
      )}
      data-testid="sofascore-search-option"
      data-player-id={option.playerId}
      data-action={action}
    >
      <div className="grid min-w-0 gap-1">
        <p className={cn("min-w-0", ui.text.bodyStrong, ui.tone.default)}>
          <NameText>{label}</NameText>
        </p>
        {option.fullName && option.fullName !== label && (
          <p className={cn("min-w-0", ui.text.secondary, ui.tone.muted)}>
            <NameText>{option.fullName}</NameText>
          </p>
        )}
        <p className={cn("min-w-0", ui.text.secondary, ui.tone.muted)}>
          {option.teamName ? <NameText>{option.teamName}</NameText> : s.noClub}
          {option.inClub && (
            <>
              {" · "}
              {s.inClub}
            </>
          )}
        </p>
        <p className={cn(ui.text.secondary, ui.tone.muted)}>
          {facts[0]}
          {" · "}
          {facts[1]}
        </p>
        <p className={cn(ui.text.secondary, ui.tone.default)}>
          {option.sofascoreId === null ? s.noLink : s.mainId(option.sofascoreId)}
        </p>
        {option.sofascoreAliasIds.length > 0 && (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>
            {s.secondIds(option.sofascoreAliasIds.join(", "))}
          </p>
        )}
        {action === "none" && (
          <p
            className={cn(ui.text.secondary, ui.tone.default)}
            data-testid="sofascore-option-inactive"
          >
            {s.inactive}
          </p>
        )}
      </div>
      {kind === null ? null : asking === kind ? (
        kind === "alias" ? (
          <ConfirmPanel
            id={titleId}
            title={copy.alias.title}
            prompt={copy.alias.prompt(entry.name, label)}
            consequence={copy.alias.consequence(option.sofascoreId ?? "")}
            yes={copy.alias.yes}
            working={copy.alias.working}
            cancel={copy.confirm.cancel}
            busy={busy}
            onConfirm={() => onConfirm("alias")}
            onCancel={onCancel}
            testId="sofascore-alias-panel"
          />
        ) : (
          <ConfirmPanel
            id={titleId}
            title={copy.confirm.title}
            prompt={copy.confirm.prompt(entry.name, label)}
            consequence={copy.confirm.consequence}
            yes={copy.confirm.yes}
            working={copy.confirm.working}
            cancel={copy.confirm.cancel}
            busy={busy}
            onConfirm={() => onConfirm("link")}
            onCancel={onCancel}
            testId="sofascore-confirm-panel"
          />
        )
      ) : (
        <div>
          <UiButton
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onAsk(kind)}
            disabled={busy}
            aria-label={kind === "alias" ? s.aliasLabel(label) : s.linkLabel(label)}
            data-testid={kind === "alias" ? "sofascore-option-alias" : "sofascore-option-link"}
          >
            {kind === "alias" ? s.alias : s.link}
          </UiButton>
        </div>
      )}
    </li>
  );
}

function CreatePanel({
  entry,
  copy,
  busy,
  onCancel,
  onCreate,
}: {
  entry: QueueEntry;
  copy: SofascoreQueueCopy;
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: CreatePlayerInput) => void;
}) {
  const c = copy.create;
  const [name, setName] = useState(entry.name);
  const [shirt, setShirt] = useState(entry.shirtNumber === null ? "" : String(entry.shirtNumber));
  const [position, setPosition] = useState<QueuePosition | "">(entry.position ?? "");
  const trimmed = name.trim();
  const nameError = trimmed.length < 2 || trimmed.length > 200;
  const shirtValue = shirt.trim() === "" ? undefined : Number(shirt.trim());
  const shirtError =
    shirtValue !== undefined &&
    (!/^[0-9]{1,2}$/.test(shirt.trim()) || shirtValue < 0 || shirtValue > 99);
  const invalid = nameError || shirtError || position === "";
  const titleId = `sofascore-create-${entry.sofascorePlayerId}-title`;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || nameError || shirtError || position === "") return;
    onCreate({
      ...(trimmed !== entry.name ? { name: trimmed } : {}),
      ...(shirtValue !== undefined && shirtValue !== entry.shirtNumber
        ? { shirtNumber: shirtValue }
        : {}),
      ...(position !== entry.position ? { position } : {}),
    });
  };
  return (
    <form
      aria-labelledby={titleId}
      className={cn(
        "grid min-w-0 gap-3 border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-3",
        ui.radius.control,
      )}
      onSubmit={submit}
      data-testid="sofascore-create-panel"
    >
      <p id={titleId} className={cn(ui.text.bodyStrong, ui.tone.default)}>
        {c.title}
      </p>
      <p className={cn("max-w-prose", ui.text.secondary, ui.tone.muted)}>{c.intro}</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <UiInput
          label={c.name}
          value={name}
          maxLength={200}
          onChange={(event) => setName(event.target.value)}
          error={nameError ? c.invalidName : undefined}
          className="min-w-0 sm:col-span-2"
          data-testid="sofascore-create-name"
        />
        <UiInput
          label={c.shirt}
          hint={c.shirtHint}
          inputMode="numeric"
          dir="ltr"
          value={shirt}
          maxLength={2}
          onChange={(event) => setShirt(event.target.value)}
          error={shirtError ? c.invalidShirt : undefined}
          className="min-w-0"
          data-testid="sofascore-create-shirt"
        />
        <UiSelect
          label={c.position}
          value={position}
          onChange={(event) => setPosition(event.target.value as QueuePosition | "")}
          placeholder={copy.facts.noPosition}
          options={QUEUE_POSITIONS.map((p) => ({ value: p, label: copy.positions[p] }))}
          className="min-w-0"
          data-testid="sofascore-create-position"
        />
      </div>
      <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Fact label={c.club}>
          {entry.teamName ? <NameText>{entry.teamName}</NameText> : copy.facts.noClub}
        </Fact>
        <Fact label={copy.facts.sofascoreId}>
          <AdminDatum>{entry.sofascorePlayerId}</AdminDatum>
        </Fact>
      </dl>
      <p className={cn("max-w-prose", ui.text.secondary, ui.tone.muted)}>{c.consequence}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <UiButton
          type="submit"
          className="w-full sm:w-auto"
          disabled={busy || invalid}
          data-testid="sofascore-create-yes"
        >
          {busy ? c.working : c.yes}
        </UiButton>
        <UiButton
          type="button"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={onCancel}
          disabled={busy}
          data-testid="sofascore-create-cancel"
        >
          {copy.confirm.cancel}
        </UiButton>
      </div>
    </form>
  );
}
