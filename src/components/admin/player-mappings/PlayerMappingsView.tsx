import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  AppPlayerOption,
  CandidateDto,
  CandidateStatus,
  ProposalDto,
} from "@/backend/football/identity/mapping-contracts";
import type { PlayerMappingRepository } from "@/backend/football/identity/mapping-repository";
import {
  ALL,
  NO_FILTERS,
  clubContexts,
  clubFacets,
  countByStatus,
  evidenceStrength,
  filterCandidates,
  heldProposals,
  nextRowIndex,
  orderCandidates,
  summarizeCandidate,
  waitingForSecondReviewer,
  QUEUE_VIEWS,
  type EvidenceStrength,
  type QueueFilters,
  type QueueView,
} from "@/backend/football/identity/review-queue";
import {
  ADMIN_PANEL_CLASS,
  AdminEmptyState,
  AdminNotice,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import { ui, UiBadge, UiButton, UiInput, UiSelect } from "@/components/ui-kit";
import { rovingTabStop, rovingTarget } from "@/components/ui-kit/tabs-keyboard";
import { cn } from "@/lib/utils";
import { CandidateComparison } from "./CandidateComparison";
import {
  getPlayerMappingCopy,
  mappingErrorMessage,
  type Lang,
  type PlayerMappingCopy,
} from "./copy";
import { AdminDatum, FlagBadges, NameText, PreviewBadge, ProviderBadge, UtcDate } from "./parts";
import { ProposalPanel, type MappingViewer } from "./ProposalPanel";
import {
  useRowPreviews,
  type LoadState,
  type MappingActions,
  type QueueData,
  type RowPreview,
} from "./use-player-mappings";

export const ROWS_PER_PAGE = 25;

type Selection = { readonly kind: "candidate" | "proposal"; readonly id: string } | null;

export interface PlayerMappingsViewProps {
  readonly lang: Lang;
  readonly state: LoadState<QueueData>;
  readonly viewer: MappingViewer;
  /** False until the owner approves the first real proposal: the screen then only reads. */
  readonly proposalsEnabled: boolean;
  readonly repository: PlayerMappingRepository | null;
  readonly context: RepositoryContext;
  readonly actions: MappingActions;
  readonly onReload: () => void;
  /** A starting point, for a static render and for tests. */
  readonly initial?: {
    readonly view?: QueueView;
    readonly filters?: Partial<QueueFilters>;
    readonly page?: number;
    readonly selection?: Selection;
    readonly options?: readonly AppPlayerOption[];
    readonly previews?: ReadonlyMap<string, RowPreview>;
  };
}

/**
 * The reviewer queue and the comparison, over data it is given. It holds only
 * what the reviewer is looking at (a tab, filters, a page, one selection); every
 * fact comes from the repository, and every durable act is a request to it.
 */
export function PlayerMappingsView({
  lang,
  state,
  viewer,
  proposalsEnabled,
  repository,
  context,
  actions,
  onReload,
  initial,
}: PlayerMappingsViewProps) {
  const copy = getPlayerMappingCopy(lang);
  const [view, setView] = useState<QueueView>(initial?.view ?? "unmapped");
  const [filters, setFilters] = useState<QueueFilters>({ ...NO_FILTERS, ...initial?.filters });
  const [page, setPage] = useState(initial?.page ?? 0);
  const [selection, setSelection] = useState<Selection>(initial?.selection ?? null);
  const lastOpened = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const data = state.status === "ready" ? state.data : null;
  const candidateById = useMemo(
    () => new Map((data?.candidates ?? []).map((c) => [c.id, c])),
    [data],
  );
  const statusCounts = useMemo(() => countByStatus(data?.candidates ?? []), [data]);
  const waiting = useMemo(() => waitingForSecondReviewer(data?.proposals ?? []), [data]);
  const held = useMemo(() => heldProposals(data?.proposals ?? []), [data]);
  const counts: Record<QueueView, number> = {
    unmapped: statusCounts.unmapped,
    proposed: statusCounts.proposed,
    waiting_second: waiting.length,
    mapped: statusCounts.mapped,
    ignored: statusCounts.ignored,
    held: held.length,
  };

  const isCandidateView =
    view === "unmapped" || view === "proposed" || view === "mapped" || view === "ignored";
  const candidateRows = useMemo(
    () =>
      isCandidateView && data
        ? orderCandidates(filterCandidates(data.candidates, { ...filters, status: view }))
        : [],
    [data, filters, view, isCandidateView],
  );
  const proposalRows = view === "waiting_second" ? waiting : view === "held" ? held : [];
  const total = isCandidateView ? candidateRows.length : proposalRows.length;
  const pages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * ROWS_PER_PAGE;
  const pageCandidates = candidateRows.slice(start, start + ROWS_PER_PAGE);
  const pageProposals = proposalRows.slice(start, start + ROWS_PER_PAGE);
  const clubs = useMemo(() => clubFacets(data?.candidates ?? []), [data]);

  const previews = useRowPreviews(
    repository,
    context,
    pageCandidates,
    isCandidateView &&
      selection === null &&
      state.status === "ready" &&
      initial?.previews === undefined,
  );
  const rowPreviews = initial?.previews ?? previews;

  // Back to the row that was open, so a keyboard reader is not dropped at the top.
  useEffect(() => {
    if (selection === null && lastOpened.current) {
      const row = listRef.current?.querySelector<HTMLElement>(
        `[data-row-id="${lastOpened.current}"]`,
      );
      row?.focus();
      lastOpened.current = null;
    }
  }, [selection]);

  const open = (next: NonNullable<Selection>) => {
    lastOpened.current = next.id;
    setSelection(next);
  };
  const changeFilters = (patch: Partial<QueueFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(0);
  };
  const onRowsKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-row-index]")];
    const current = rows.findIndex((row) => row === document.activeElement);
    const target = nextRowIndex(event.key, current < 0 ? 0 : current, rows.length);
    if (target === null || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    rows[target]?.focus();
  };

  const wrapper = (children: ReactNode) => (
    <section
      dir={copy.dir}
      lang={lang}
      className="grid gap-5"
      data-testid="player-mappings"
      data-direction={copy.dir}
    >
      <header>
        <p className={cn("max-w-prose", ui.text.secondary, ui.tone.muted)}>{copy.intro}</p>
        <p
          className={cn("mt-2 max-w-prose", ui.text.meta, ui.tone.muted)}
          data-testid="mapping-preview-notice"
        >
          {copy.previewNotice}
        </p>
        {!proposalsEnabled && (
          <div className="mt-3" data-testid="mapping-read-only">
            <AdminNotice tone="info" role="status">
              {copy.writesDisabled}
            </AdminNotice>
          </div>
        )}
        {proposalsEnabled && !viewer.canManage && (
          <div className="mt-3">
            <AdminNotice tone="info" role="status">
              {copy.noPermission}
            </AdminNotice>
          </div>
        )}
      </header>
      {children}
    </section>
  );

  if (state.status === "loading")
    return wrapper(
      <div data-testid="mapping-loading" role="status" aria-live="polite">
        <p className={cn("mb-3", ui.text.secondary, ui.tone.muted)}>
          {state.loaded > 0 ? copy.loadingProgress(state.loaded) : copy.loading}
        </p>
        <AdminSkeletonList rows={5} surface="card" />
      </div>,
    );

  if (state.status === "error")
    return wrapper(
      <div className="grid gap-3" data-testid="mapping-error">
        <AdminNotice tone="alert" role="alert">
          {copy.loadFailed(state.code)} {mappingErrorMessage(copy, state.code)}
        </AdminNotice>
        <div>
          <UiButton size="sm" onClick={onReload} data-testid="mapping-retry">
            {copy.retry}
          </UiButton>
        </div>
      </div>,
    );

  const ready = state.data;
  if (ready.candidates.length === 0)
    return wrapper(<AdminEmptyState testId="mapping-empty">{copy.empty}</AdminEmptyState>);

  // ---- the detail of one selection ----
  const selectedProposal =
    selection?.kind === "proposal"
      ? (ready.proposals.find((p) => p.id === selection.id) ?? null)
      : null;
  const selectedCandidate =
    selection?.kind === "candidate"
      ? (candidateById.get(selection.id) ?? null)
      : selectedProposal
        ? (candidateById.get(
            selectedProposal.sofascoreCandidateId ?? selectedProposal.flashscoreCandidateId ?? "",
          ) ?? null)
        : null;

  if (selection !== null) {
    const proposalOfCandidate =
      selectedProposal ??
      (selectedCandidate?.openProposalId
        ? (ready.proposals.find((p) => p.id === selectedCandidate.openProposalId) ?? null)
        : null);
    return wrapper(
      selectedCandidate ? (
        <CandidateComparison
          key={selectedCandidate.id}
          candidate={selectedCandidate}
          openProposal={proposalOfCandidate}
          availability={ready.availability}
          viewer={viewer}
          lang={lang}
          copy={copy}
          writesEnabled={proposalsEnabled}
          actions={actions}
          repository={repository}
          context={context}
          preloadedOptions={initial?.options}
          onChanged={onReload}
          onClose={() => setSelection(null)}
        />
      ) : selectedProposal ? (
        <div className="grid gap-3">
          <div>
            <UiButton
              variant="outline"
              size="sm"
              onClick={() => setSelection(null)}
              data-testid="mapping-comparison-close"
            >
              {copy.detail.close}
            </UiButton>
          </div>
          <ProposalPanel
            proposal={selectedProposal}
            availability={ready.availability}
            viewer={viewer}
            lang={lang}
            copy={copy}
            writesEnabled={proposalsEnabled}
            actions={actions}
            onChanged={onReload}
          />
        </div>
      ) : (
        <div className="grid gap-3">
          <AdminNotice tone="alert" role="alert">
            {copy.errors.candidate_not_found}
          </AdminNotice>
          <div>
            <UiButton variant="outline" size="sm" onClick={() => setSelection(null)}>
              {copy.detail.close}
            </UiButton>
          </div>
        </div>
      ),
    );
  }

  // ---- the queue ----
  return wrapper(
    <>
      <QueueTabs
        label={copy.viewsLabel}
        rtl={copy.dir === "rtl"}
        value={view}
        onChange={(next) => {
          setView(next);
          setPage(0);
        }}
        items={QUEUE_VIEWS.map((value) => ({
          value,
          label: copy.views[value],
          count: counts[value],
        }))}
      />

      <FilterBar
        copy={copy}
        filters={filters}
        view={view}
        clubs={clubs}
        onChange={changeFilters}
        onView={(next) => {
          setView(next);
          setPage(0);
        }}
        shown={total}
        all={isCandidateView ? statusCounts[view as CandidateStatus] : proposalRows.length}
        showCandidateFilters={isCandidateView}
      />

      <div
        role="tabpanel"
        id={`mapping-view-panel-${view}`}
        aria-label={copy.views[view]}
        data-testid="mapping-queue"
        data-view={view}
        className="grid gap-3"
      >
        {total === 0 ? (
          <AdminEmptyState testId="mapping-empty-view">{copy.emptyView[view]}</AdminEmptyState>
        ) : isCandidateView ? (
          <ul
            ref={listRef}
            className="grid gap-2"
            aria-label={copy.views[view]}
            onKeyDown={onRowsKeyDown}
            data-testid="mapping-rows"
          >
            {pageCandidates.map((candidate, index) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                index={index}
                copy={copy}
                preview={rowPreviews.get(candidate.id)}
                proposal={ready.proposals.find((p) => p.id === candidate.openProposalId) ?? null}
                onOpen={() => open({ kind: "candidate", id: candidate.id })}
              />
            ))}
          </ul>
        ) : (
          <ul
            ref={listRef}
            className="grid gap-2"
            aria-label={copy.views[view]}
            onKeyDown={onRowsKeyDown}
            data-testid="mapping-rows"
          >
            {pageProposals.map((proposal, index) => (
              <ProposalRow
                key={proposal.id}
                proposal={proposal}
                index={index}
                copy={copy}
                lang={lang}
                candidate={
                  candidateById.get(
                    proposal.sofascoreCandidateId ?? proposal.flashscoreCandidateId ?? "",
                  ) ?? null
                }
                onOpen={() => open({ kind: "proposal", id: proposal.id })}
              />
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav
            className="flex flex-wrap items-center justify-between gap-2"
            aria-label={copy.row.page(safePage + 1, pages)}
          >
            <UiButton
              variant="outline"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              data-testid="mapping-prev"
            >
              {copy.row.previous}
            </UiButton>
            <span
              className={cn(ui.text.meta, ui.tone.muted)}
              aria-live="polite"
              data-testid="mapping-page"
            >
              {copy.row.page(safePage + 1, pages)}
            </span>
            <UiButton
              variant="outline"
              size="sm"
              disabled={safePage >= pages - 1}
              onClick={() => setPage(safePage + 1)}
              data-testid="mapping-next"
            >
              {copy.row.next}
            </UiButton>
          </nav>
        )}
      </div>
    </>,
  );
}

/**
 * The six views as a row of round chips that scrolls sideways on a phone, the way
 * the admin sections do. (The kit's equal-width tab grid is built for two or
 * three short labels; six long ones were cut to an ellipsis.) It keeps the
 * tabs pattern: one tab stop, arrow keys move through the views in READING
 * order (so ArrowLeft goes forward in Arabic), Home and End jump to the ends.
 */
function QueueTabs({
  label,
  rtl,
  value,
  onChange,
  items,
}: {
  label: string;
  rtl: boolean;
  value: QueueView;
  onChange: (next: QueueView) => void;
  items: readonly { value: QueueView; label: string; count: number }[];
}) {
  const tabs = useRef(new Map<QueueView, HTMLButtonElement>());
  const tabStop = rovingTabStop(items, value);
  return (
    <div
      role="tablist"
      aria-label={label}
      data-testid="mapping-tabs"
      className="-m-1 flex gap-2 overflow-x-auto p-1 [scrollbar-width:none]"
      onKeyDown={(event) => {
        const focused = items.find((item) => tabs.current.get(item.value) === event.target)?.value;
        const target = rovingTarget(items, event, focused, value, rtl);
        if (target === null) return;
        event.preventDefault();
        tabs.current.get(target)?.focus();
        if (target !== value) onChange(target);
      }}
    >
      {items.map((item) => (
        <button
          key={item.value}
          ref={(node) => {
            if (node) tabs.current.set(item.value, node);
            else tabs.current.delete(item.value);
          }}
          id={`mapping-view-tab-${item.value}`}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          aria-controls={item.value === value ? `mapping-view-panel-${item.value}` : undefined}
          tabIndex={item.value === tabStop ? 0 : -1}
          onClick={() => onChange(item.value)}
          data-testid={`mapping-tab-${item.value}`}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-1.5 px-4 transition-colors",
            ui.space.tap,
            ui.radius.full,
            ui.text.meta,
            "[font-weight:var(--ui-weight-strong)]",
            ui.surface.sunken,
            "aria-selected:bg-[color:var(--ui-ink)] aria-selected:text-[color:var(--ui-on-ink-plain)]",
            ui.focus,
          )}
        >
          <span>{item.label}</span>
          <span>{`(${item.count})`}</span>
        </button>
      ))}
    </div>
  );
}

function FilterBar({
  copy,
  filters,
  view,
  clubs,
  onChange,
  onView,
  shown,
  all,
  showCandidateFilters,
}: {
  copy: PlayerMappingCopy;
  filters: QueueFilters;
  view: QueueView;
  clubs: readonly { clubKey: string; count: number }[];
  onChange: (patch: Partial<QueueFilters>) => void;
  onView: (view: QueueView) => void;
  shown: number;
  all: number;
  showCandidateFilters: boolean;
}) {
  const f = copy.filters;
  const flagOptions = Object.keys(copy.flags);
  const dirty = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  return (
    <form
      className={cn(ADMIN_PANEL_CLASS, "grid gap-3 p-3")}
      role="search"
      aria-label={f.label}
      onSubmit={(event) => event.preventDefault()}
      data-testid="mapping-filters"
    >
      {showCandidateFilters && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <UiSelect
            label={f.club}
            value={filters.club}
            onChange={(event) => onChange({ club: event.target.value })}
            options={[
              { value: ALL, label: f.all },
              ...clubs.map((club) => ({
                value: club.clubKey,
                label: `${copy.clubLabel(club.clubKey)} (${club.count})`,
              })),
            ]}
            data-testid="mapping-filter-club"
          />
          <UiSelect
            label={f.provider}
            value={filters.provider}
            onChange={(event) =>
              onChange({ provider: event.target.value as QueueFilters["provider"] })
            }
            options={[
              { value: ALL, label: f.all },
              { value: "sofascore", label: copy.providers.sofascore },
              { value: "flashscore", label: copy.providers.flashscore },
            ]}
            data-testid="mapping-filter-provider"
          />
          <UiSelect
            label={f.status}
            value={
              view === "unmapped" || view === "proposed" || view === "mapped" || view === "ignored"
                ? view
                : ALL
            }
            onChange={(event) => {
              const next = event.target.value;
              if (next !== ALL) onView(next as QueueView);
            }}
            options={[
              ...(view === "waiting_second" || view === "held"
                ? [{ value: ALL, label: copy.views[view] }]
                : []),
              { value: "unmapped", label: copy.statuses.unmapped! },
              { value: "proposed", label: copy.statuses.proposed! },
              { value: "mapped", label: copy.statuses.mapped! },
              { value: "ignored", label: copy.statuses.ignored! },
            ]}
            data-testid="mapping-filter-status"
          />
          <UiSelect
            label={f.evidence}
            hint={copy.evidenceHelp}
            value={filters.evidence}
            onChange={(event) =>
              onChange({ evidence: event.target.value as EvidenceStrength | "all" })
            }
            options={[
              { value: ALL, label: f.all },
              { value: "rich", label: copy.evidence.rich },
              { value: "partial", label: copy.evidence.partial },
              { value: "thin", label: copy.evidence.thin },
            ]}
            data-testid="mapping-filter-evidence"
          />
          <UiSelect
            label={f.flag}
            value={filters.flag}
            onChange={(event) => onChange({ flag: event.target.value })}
            options={[
              { value: ALL, label: f.all },
              ...flagOptions.map((flag) => ({ value: flag, label: copy.flags[flag]! })),
            ]}
            data-testid="mapping-filter-flag"
          />
          <UiInput
            label={f.search}
            hint={f.searchHint}
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            data-testid="mapping-filter-search"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(ui.text.meta, ui.tone.muted)}
          aria-live="polite"
          data-testid="mapping-result-count"
        >
          {f.results(shown, all)}
        </p>
        {showCandidateFilters && dirty && (
          <UiButton
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...NO_FILTERS })}
            data-testid="mapping-filter-clear"
          >
            {f.clear}
          </UiButton>
        )}
      </div>
    </form>
  );
}

function CandidateRow({
  candidate,
  index,
  copy,
  preview,
  proposal,
  onOpen,
}: {
  candidate: CandidateDto;
  index: number;
  copy: PlayerMappingCopy;
  preview: RowPreview | undefined;
  proposal: ProposalDto | null;
  onOpen: () => void;
}) {
  const summary = summarizeCandidate(candidate);
  const clubs = clubContexts(candidate);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-row-index={index}
        data-row-id={candidate.id}
        data-testid="mapping-row"
        data-provider={candidate.provider}
        className={cn(
          "grid w-full gap-2 p-3 text-start",
          ui.surface.card,
          ui.radius.track,
          ui.focus,
          "min-h-[var(--ui-row-min)]",
        )}
      >
        <span className="flex flex-wrap items-center gap-2">
          <ProviderBadge provider={candidate.provider} copy={copy} />
          <span className={cn(ui.text.bodyStrong, ui.tone.default)}>
            <NameText>{candidate.displayName ?? "—"}</NameText>
          </span>
          <AdminDatum className={cn(ui.text.meta, ui.tone.muted)}>
            {candidate.externalId}
          </AdminDatum>
        </span>
        <span
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1",
            ui.text.secondary,
            ui.tone.muted,
          )}
        >
          <span data-testid="mapping-row-club">
            {clubs.map((c) => copy.clubLabel(c.clubKey)).join(" · ") || "—"}
            {clubs.length > 1 && <span>{` (${copy.row.multiClub})`}</span>}
          </span>
          <span>
            {summary.shirts.length > 0
              ? `${copy.row.shirt} ${summary.shirts.join(", ")}`
              : copy.row.noShirt}
          </span>
          <span>
            {summary.positions.length > 0
              ? summary.positions.map((p) => copy.positions[p]).join(", ")
              : copy.row.noPosition}
          </span>
          <span data-testid="mapping-row-evidence">
            {copy.evidence[evidenceStrength(candidate)]}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <FlagBadges flags={candidate.flags} copy={copy} />
          <span
            className={cn(ui.text.meta, ui.tone.default)}
            data-testid="mapping-row-options"
            aria-live="polite"
          >
            {preview === undefined || preview.status === "pending"
              ? copy.row.optionsPending
              : preview.status === "failed"
                ? copy.row.optionsFailed
                : copy.row.options(preview.plausible)}
          </span>
          {preview?.status === "ready" && (
            <PreviewBadge category={preview.preview.category} copy={copy} />
          )}
          {proposal && (
            <UiBadge tone={proposal.canApprove ? "caution" : "neutral"}>
              {copy.proposalStatuses[proposal.effectiveStatus] ?? proposal.effectiveStatus}
            </UiBadge>
          )}
        </span>
      </button>
    </li>
  );
}

function ProposalRow({
  proposal,
  index,
  copy,
  lang,
  candidate,
  onOpen,
}: {
  proposal: ProposalDto;
  index: number;
  copy: PlayerMappingCopy;
  lang: Lang;
  candidate: CandidateDto | null;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-row-index={index}
        data-row-id={proposal.id}
        data-testid="mapping-proposal-row"
        data-proposal-status={proposal.effectiveStatus}
        className={cn(
          "grid w-full gap-2 p-3 text-start",
          ui.surface.card,
          ui.radius.track,
          ui.focus,
          "min-h-[var(--ui-row-min)]",
        )}
      >
        <span className="flex flex-wrap items-center gap-2">
          <UiBadge tone="caution">
            {copy.proposalStatuses[proposal.effectiveStatus] ?? proposal.effectiveStatus}
          </UiBadge>
          <UiBadge tone="outline">{copy.proposalKinds[proposal.kind] ?? proposal.kind}</UiBadge>
          {candidate && (
            <span className={cn(ui.text.bodyStrong, ui.tone.default)}>
              <NameText>{candidate.displayName ?? "—"}</NameText>
            </span>
          )}
        </span>
        <span className={cn(ui.text.secondary, ui.tone.muted)}>
          {proposal.proposedByMe ? copy.proposal.you : copy.proposal.someoneElse}
          {" · "}
          {copy.proposal.expiresAt} <UtcDate iso={proposal.expiresAt} />
        </span>
        <span className={cn("line-clamp-2 break-words", ui.text.meta, ui.tone.muted)}>
          {proposal.reason}
        </span>
      </button>
    </li>
  );
}
