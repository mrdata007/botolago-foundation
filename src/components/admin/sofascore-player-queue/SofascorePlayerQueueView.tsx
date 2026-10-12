import { useMemo, useRef, useState } from "react";
import type {
  ParsedQueue,
  QueueCandidate,
  QueueEntry,
  ResolveResult,
} from "@/backend/football/identity/sofascore-player-queue";
import { mapSofascoreQueueError } from "@/backend/football/identity/sofascore-player-queue";
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
import { ui, UiButton } from "@/components/ui-kit";
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

type Confirming = { readonly sofascorePlayerId: string; readonly playerId: string };

export interface SofascorePlayerQueueViewProps {
  readonly lang: Lang;
  readonly state: QueueLoadState;
  /** Draws the confirm controls. The database still decides whether a call is allowed. */
  readonly canManage: boolean;
  readonly onReload: () => void;
  readonly resolve: (sofascorePlayerId: string, playerId: string) => Promise<ResolveResult>;
  /** A starting point, for a static render and for tests. */
  readonly initial?: {
    readonly confirming?: Confirming;
    readonly notice?: string;
    readonly entryErrors?: Readonly<Record<string, string>>;
  };
}

const candidateLabel = (c: QueueCandidate, copy: SofascoreQueueCopy) =>
  c.displayName ?? c.fullName ?? copy.candidates.unnamed;

/**
 * The list of SofaScore players the matcher held, and the one act staff can make
 * on each: confirm which BotolaGO player he is. It holds only what the reader is
 * doing (one pending confirmation, the sentences to show); every fact comes
 * from the repository.
 */
export function SofascorePlayerQueueView({
  lang,
  state,
  canManage,
  onReload,
  resolve,
  initial,
}: SofascorePlayerQueueViewProps) {
  const copy = getSofascoreQueueCopy(lang);
  // The reply to a confirmation can come after the language changed: word it in the current one.
  const latestCopy = useRef(copy);
  latestCopy.current = copy;
  const [confirming, setConfirming] = useState<Confirming | null>(initial?.confirming ?? null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(initial?.notice ?? null);
  const [entryErrors, setEntryErrors] = useState<Readonly<Record<string, string>>>(
    initial?.entryErrors ?? {},
  );
  // Confirmed in this session: gone from the list at once, without waiting for a reload.
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());

  // A fresh list from the server replaces what was done locally.
  const version = state.status === "ready" ? state.version : undefined;
  const [seenVersion, setSeenVersion] = useState(version);
  if (seenVersion !== version) {
    setSeenVersion(version);
    setDone(new Set());
    setEntryErrors({});
    setConfirming(null);
  }
  // Sentences already shown were written in the language of their moment: drop them on a switch.
  const [seenLang, setSeenLang] = useState(lang);
  if (seenLang !== lang) {
    setSeenLang(lang);
    setNotice(null);
    setEntryErrors({});
  }

  const entries = useMemo(
    () =>
      state.status === "ready"
        ? state.data.entries.filter((e) => !done.has(e.sofascorePlayerId))
        : [],
    [state, done],
  );

  const confirm = async (entry: QueueEntry, candidate: QueueCandidate) => {
    if (busy || !canManage) return;
    setBusy(true);
    setNotice(null);
    setEntryErrors((current) => {
      const { [entry.sofascorePlayerId]: _dropped, ...rest } = current;
      return rest;
    });
    try {
      const result = await resolve(entry.sofascorePlayerId, candidate.playerId);
      const words = latestCopy.current;
      setDone((current) => new Set(current).add(entry.sofascorePlayerId));
      setConfirming(null);
      setNotice(
        result.alreadyResolved
          ? words.alreadyDone(entry.name)
          : words.done(entry.name, candidateLabel(candidate, words)),
      );
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
            {entries.map((entry) => (
              <EntryCard
                key={entry.sofascorePlayerId}
                entry={entry}
                copy={copy}
                canManage={canManage}
                busy={busy}
                confirming={confirming}
                error={entryErrors[entry.sofascorePlayerId] ?? null}
                onAsk={(playerId) =>
                  setConfirming({ sofascorePlayerId: entry.sofascorePlayerId, playerId })
                }
                onCancel={() => setConfirming(null)}
                onConfirm={(candidate) => void confirm(entry, candidate)}
              />
            ))}
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

function EntryCard({
  entry,
  copy,
  canManage,
  busy,
  confirming,
  error,
  onAsk,
  onCancel,
  onConfirm,
}: {
  entry: QueueEntry;
  copy: SofascoreQueueCopy;
  canManage: boolean;
  busy: boolean;
  confirming: Confirming | null;
  error: string | null;
  onAsk: (playerId: string) => void;
  onCancel: () => void;
  onConfirm: (candidate: QueueCandidate) => void;
}) {
  const reason = reasonCopy(copy, entry.reason);
  const headingId = `sofascore-entry-${entry.sofascorePlayerId}-title`;
  const f = copy.facts;
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
          <p className={cn("max-w-prose", ui.text.secondary, ui.tone.muted)}>
            {copy.candidates.noneNoButton}
          </p>
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
                busy={busy}
                asking={
                  confirming?.sofascorePlayerId === entry.sofascorePlayerId &&
                  confirming.playerId === candidate.playerId
                }
                onAsk={() => onAsk(candidate.playerId)}
                onCancel={onCancel}
                onConfirm={() => onConfirm(candidate)}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function CandidateRow({
  entry,
  candidate,
  copy,
  canManage,
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
  busy: boolean;
  asking: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const f = copy.facts;
  const label = candidateLabel(candidate, copy);
  const locked = candidate.mappedToSofascoreId !== null;
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
      </div>

      {locked ? (
        <p
          className={cn(ui.text.secondary, ui.tone.default)}
          data-testid="sofascore-queue-candidate-locked"
        >
          {copy.candidates.alreadyMapped(candidate.mappedToSofascoreId ?? "")}
        </p>
      ) : !canManage ? null : asking ? (
        <div
          role="group"
          aria-labelledby={titleId}
          className={cn(
            "grid gap-3 border border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] p-3",
            ui.radius.control,
          )}
          data-testid="sofascore-confirm-panel"
        >
          <p id={titleId} className={cn(ui.text.bodyStrong, ui.tone.default)}>
            {copy.confirm.title}
          </p>
          <p className={cn(ui.text.body, ui.tone.default)}>
            {copy.confirm.prompt(entry.name, label)}
          </p>
          <p className={cn(ui.text.secondary, ui.tone.muted)}>{copy.confirm.consequence}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <UiButton
              className="w-full sm:w-auto"
              onClick={onConfirm}
              disabled={busy}
              data-testid="sofascore-confirm-yes"
            >
              {busy ? copy.confirm.working : copy.confirm.yes}
            </UiButton>
            <UiButton
              variant="outline"
              className="w-full sm:w-auto"
              onClick={onCancel}
              disabled={busy}
              data-testid="sofascore-confirm-cancel"
            >
              {copy.confirm.cancel}
            </UiButton>
          </div>
        </div>
      ) : (
        <div>
          <UiButton
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onAsk}
            disabled={busy}
            aria-label={copy.confirm.openLabel(label)}
            data-testid="sofascore-confirm-open"
          >
            {copy.confirm.open}
          </UiButton>
        </div>
      )}
    </li>
  );
}
