import { useMemo, useState } from "react";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type { BulkPhase, BulkRowState } from "@/backend/football/identity/bulk-mapping/contract";
import { flashscoreProfile } from "@/backend/football/identity/bulk-mapping/flashscore-profile";
import { proposeCallCount } from "@/backend/football/identity/bulk-mapping/runner";
import type { PlayerMappingRepository } from "@/backend/football/identity/mapping-repository";
import { AdminNotice } from "@/components/admin/AdminSurfaces";
import { ui, UiBadge, UiButton, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { getBulkCopy } from "./bulk-copy";
import type { PlayerMappingCopy } from "./copy";
import { AdminDatum, NameText, ProviderBadge } from "./parts";
import {
  isFlashscoreManifest,
  useBulkBatch,
  type BulkKind,
  type DisplayNames,
  type ManifestState,
} from "./use-bulk-batch";
import type { QueueData } from "./use-player-mappings";
import type { Lang } from "./copy";

const STATE_TONE: Record<BulkRowState, "positive" | "neutral" | "outline" | "caution"> = {
  NOT_PROPOSED: "outline",
  PROPOSED: "neutral",
  APPROVED: "neutral",
  EXECUTED: "positive",
  STALE_EVIDENCE: "caution",
  IDENTITY_CONFLICT: "caution",
  TARGET_ALREADY_MAPPED: "caution",
  PROVIDER_ID_ALREADY_MAPPED: "caution",
  APPROVAL_EXPIRED: "caution",
  HELD: "caution",
  ERROR: "caution",
};

const HELD_STATES: readonly BulkRowState[] = [
  "STALE_EVIDENCE",
  "IDENTITY_CONFLICT",
  "TARGET_ALREADY_MAPPED",
  "PROVIDER_ID_ALREADY_MAPPED",
  "APPROVAL_EXPIRED",
  "HELD",
  "ERROR",
];

export interface BulkMappingPanelProps {
  readonly lang: Lang;
  readonly copy: PlayerMappingCopy;
  readonly data: QueueData | null;
  readonly repository: PlayerMappingRepository | null;
  readonly context: RepositoryContext;
  readonly rawManifest: unknown;
  /** Which frozen batch to show. Default: the completed Sofascore batch. */
  readonly kind?: BulkKind;
  readonly onReload: () => void;
  readonly onClose: () => void;
  /** A starting point, for a static render and for tests. */
  readonly initial?: { readonly manifest?: ManifestState; readonly names?: DisplayNames };
}

/**
 * The controlled batch: review all rows, deselect any, then three separate,
 * typed-confirmation actions. Every action goes through the reviewed repository
 * (the database re-checks staff, AAL2, recent sign-in, permission, fingerprint and
 * evidence for every single proposal). Names are display-only; nothing here reads
 * one to decide anything. Nothing runs by itself.
 */
export function BulkMappingPanel({
  lang,
  copy,
  data,
  repository,
  context,
  rawManifest,
  kind = "sofascore",
  onReload,
  onClose,
  initial,
}: BulkMappingPanelProps) {
  const b = getBulkCopy(lang);
  const f = b.flashscore;
  const batch = useBulkBatch({
    kind,
    rawManifest,
    repository,
    context,
    data,
    onReload,
    initialManifest: initial?.manifest,
    initialNames: initial?.names,
  });
  const { manifestState, manifest } = batch;
  // The verified manifest tells which batch it is; each branch below sees its own row type.
  const flashManifest = manifest && isFlashscoreManifest(manifest) ? manifest : null;
  const sofaManifest = manifest && !isFlashscoreManifest(manifest) ? manifest : null;
  const isFlashscore = flashManifest !== null || (manifest === null && kind === "flashscore");
  const proposeCalls = flashManifest
    ? proposeCallCount(
        flashscoreProfile,
        flashManifest.rows.filter((r) => batch.selected.has(r.candidateId)),
      )
    : 0;
  const candidates = useMemo(() => new Map((data?.candidates ?? []).map((c) => [c.id, c])), [data]);
  const mappedNow = (data?.candidates ?? []).filter((c) => c.status === "mapped").length;
  const approvedCount = batch.inState("APPROVED");
  const selfApprovalAllowed = data?.availability.selfApprovalAllowed ?? false;

  const selectCell = (row: { candidateId: string; externalId: string }) => (
    <td className="p-2">
      <input
        type="checkbox"
        checked={batch.selected.has(row.candidateId)}
        onChange={() => batch.toggle(row.candidateId)}
        aria-label={`${b.table.select} ${row.externalId}`}
        disabled={batch.running !== null}
        data-testid="bulk-row-select"
      />
    </td>
  );
  const targetCell = (row: { appPlayerId: string }) => {
    const appName = batch.names.appPlayer.get(row.appPlayerId);
    return (
      <td className="p-2">
        <NameText>{appName === undefined ? b.table.loadingName : (appName ?? "—")}</NameText>
        <br />
        <AdminDatum className={cn(ui.text.meta, ui.tone.muted)}>{row.appPlayerId}</AdminDatum>
      </td>
    );
  };
  const stateCell = (row: { candidateId: string }) => {
    const info = batch.rowStates.get(row.candidateId);
    const state = info?.state ?? "NOT_PROPOSED";
    return (
      <td className="p-2">
        <UiBadge tone={STATE_TONE[state]}>
          <span data-row-state={state}>{b.states[state]}</span>
        </UiBadge>
        {info?.code && HELD_STATES.includes(state) && (
          <p className={cn("mt-0.5", ui.text.meta, ui.tone.muted)} data-testid="bulk-row-code">
            {info.code}
          </p>
        )}
      </td>
    );
  };

  return (
    <section className="grid gap-4" data-testid="bulk-panel" dir={copy.dir} lang={lang}>
      <div>
        <UiButton variant="outline" size="sm" onClick={onClose} data-testid="bulk-close">
          {b.back}
        </UiButton>
      </div>
      <header className="grid gap-2">
        <h3 className={cn(ui.text.bodyStrong, ui.tone.default)}>
          {isFlashscore ? f.title : b.title}
        </h3>
        <p className={cn("max-w-prose", ui.text.secondary, ui.tone.muted)}>
          {isFlashscore ? f.intro : b.intro}
        </p>
        <ul
          className={cn("list-disc ps-5", ui.text.secondary, ui.tone.muted)}
          data-testid="bulk-rules"
        >
          {(isFlashscore ? f.rules : b.rules).map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
        {!isFlashscore && (
          <AdminNotice tone="info" role="status" testId="bulk-flashscore">
            {b.flashscoreExcluded}
          </AdminNotice>
        )}
        <AdminNotice tone="alert" role="status" testId="bulk-no-auto">
          {b.noAutoNext}
        </AdminNotice>
      </header>

      <div className="grid gap-1" data-testid="bulk-manifest">
        <p className={cn(ui.text.label, ui.tone.muted)}>{b.manifestHeading}</p>
        {manifestState.status === "checking" && (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>{b.manifestChecking}</p>
        )}
        {manifestState.status === "bad" && (
          <AdminNotice tone="alert" role="alert" testId="bulk-manifest-bad">
            {b.manifestBad} {manifestState.problems.slice(0, 3).join(" · ")}
          </AdminNotice>
        )}
        {manifest && (
          <>
            <p className={cn(ui.text.secondary, ui.tone.default)}>
              {flashManifest
                ? f.population(
                    flashManifest.population.total,
                    flashManifest.population.f1,
                    flashManifest.population.f2,
                    flashManifest.population.heldBack,
                  )
                : sofaManifest &&
                  b.population(
                    sofaManifest.population.total,
                    sofaManifest.population.tierA,
                    sofaManifest.population.tierB,
                  )}
            </p>
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {b.manifestHash} : <AdminDatum>{manifest.manifestSha256}</AdminDatum>
            </p>
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {flashManifest ? f.manifestOk : b.manifestOk}
            </p>
          </>
        )}
      </div>

      {flashManifest && (
        <AdminNotice tone="alert" role="status" testId="bulk-held-back">
          <strong className="block">
            {f.heldBack.heading(
              flashManifest.population.heldBack,
              flashManifest.population.reviewSet,
            )}
          </strong>
          <span className="block">{f.heldBack.note}</span>
          {flashManifest.heldBack.length > 0 && (
            <details className="mt-1" data-testid="bulk-held-back-list">
              <summary className="cursor-pointer">{f.heldBack.listHeading}</summary>
              <ul className="mt-1 list-disc ps-5">
                {flashManifest.heldBack.map((held) => (
                  <li key={held.candidateId} data-testid="bulk-held-back-row">
                    <AdminDatum>{held.externalId}</AdminDatum> · {f.classShort[held.evidenceClass]}{" "}
                    · <AdminDatum>{held.codes.join(", ")}</AdminDatum>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </AdminNotice>
      )}

      {manifest && (
        <>
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label={b.table.state}
            data-testid="bulk-counts"
          >
            {(Object.keys(b.states) as BulkRowState[])
              .filter((s) => batch.counts[s] > 0)
              .map((state) => (
                <li key={state}>
                  <UiBadge tone={STATE_TONE[state]}>
                    <span data-state-count={state}>
                      {b.states[state]} : {batch.counts[state]}
                    </span>
                  </UiBadge>
                </li>
              ))}
          </ul>

          <div className="grid gap-2" data-testid="bulk-selection">
            <div className="flex flex-wrap items-center gap-2">
              <UiButton
                size="sm"
                variant="outline"
                onClick={() => batch.setAll(true)}
                data-testid="bulk-select-all"
              >
                {b.table.selectAll}
              </UiButton>
              <UiButton
                size="sm"
                variant="outline"
                onClick={() => batch.setAll(false)}
                data-testid="bulk-select-none"
              >
                {b.table.selectNone}
              </UiButton>
              <span
                className={cn(ui.text.secondary, ui.tone.default)}
                data-testid="bulk-selected-count"
              >
                {b.table.selected(batch.selected.size, manifest.rows.length)}
              </span>
            </div>
            <p className={cn(ui.text.meta, ui.tone.muted)}>{b.table.deselectNote}</p>
          </div>

          <div className="overflow-x-auto" data-testid="bulk-table-wrap">
            <table
              className={cn(
                "w-full border-collapse text-start",
                flashManifest ? "min-w-[68rem]" : "min-w-[60rem]",
              )}
              data-testid="bulk-table"
            >
              <caption className="sr-only">{isFlashscore ? f.title : b.title}</caption>
              <thead>
                <tr className={cn(ui.text.label, ui.tone.muted)}>
                  <th scope="col" className="p-2 text-start">
                    {b.table.select}
                  </th>
                  <th scope="col" className="p-2 text-start">
                    {b.table.provider} <span className="font-normal">({b.table.displayOnly})</span>
                  </th>
                  <th scope="col" className="p-2 text-start">
                    {isFlashscore ? f.table.providerId : b.table.providerId}
                  </th>
                  {isFlashscore ? (
                    <>
                      <th scope="col" className="p-2 text-start">
                        {f.table.supportingId}
                      </th>
                      <th scope="col" className="p-2 text-start">
                        {b.table.club}
                      </th>
                      <th scope="col" className="p-2 text-start">
                        {f.table.evidenceClass}
                      </th>
                      <th scope="col" className="p-2 text-start">
                        {f.table.evidence}
                      </th>
                    </>
                  ) : (
                    <>
                      <th scope="col" className="p-2 text-start">
                        {b.table.club}
                      </th>
                      <th scope="col" className="p-2 text-start">
                        {b.table.position}
                      </th>
                      <th scope="col" className="p-2 text-start">
                        {b.table.dob}
                      </th>
                      <th scope="col" className="p-2 text-start">
                        {b.table.shirt}
                      </th>
                      <th scope="col" className="p-2 text-start">
                        {b.table.sportsMonks}
                      </th>
                      <th scope="col" className="p-2 text-start">
                        {b.table.tier}
                      </th>
                    </>
                  )}
                  <th scope="col" className="p-2 text-start">
                    {b.table.target} <span className="font-normal">({b.table.displayOnly})</span>
                  </th>
                  <th scope="col" className="p-2 text-start">
                    {b.table.state}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sofaManifest?.rows.map((row) => {
                  const candidate = candidates.get(row.candidateId);
                  const state = batch.rowStates.get(row.candidateId)?.state ?? "NOT_PROPOSED";
                  const observation = candidate?.observations[0];
                  return (
                    <tr
                      key={row.candidateId}
                      className="border-t border-[color:var(--ui-border)] align-top"
                      data-testid="bulk-row"
                      data-candidate-id={row.candidateId}
                      data-tier={row.tier}
                      data-state={state}
                    >
                      {selectCell(row)}
                      <td className="p-2">
                        <ProviderBadge provider="sofascore" copy={copy} />{" "}
                        <NameText>{candidate?.displayName ?? "—"}</NameText>
                      </td>
                      <td className="p-2">
                        <AdminDatum>{row.externalId}</AdminDatum>
                      </td>
                      <td className="p-2">{copy.clubLabel(observation?.clubKey ?? null)}</td>
                      <td className="p-2">{observation?.position ?? "—"}</td>
                      <td className="p-2">{b.table.match}</td>
                      <td className="p-2">
                        {row.signals.shirt === "match" ? b.table.match : b.table.noSignal}
                      </td>
                      <td className="p-2">{b.table.yes}</td>
                      <td className="p-2">{row.tier}</td>
                      {targetCell(row)}
                      {stateCell(row)}
                    </tr>
                  );
                })}
                {flashManifest?.rows.map((row) => {
                  const candidate = candidates.get(row.candidateId);
                  const state = batch.rowStates.get(row.candidateId)?.state ?? "NOT_PROPOSED";
                  const observation = candidate?.observations[0];
                  const { evidence } = row;
                  return (
                    <tr
                      key={row.candidateId}
                      className="border-t border-[color:var(--ui-border)] align-top"
                      data-testid="bulk-row"
                      data-candidate-id={row.candidateId}
                      data-class={row.evidenceClass}
                      data-state={state}
                    >
                      {selectCell(row)}
                      <td className="p-2">
                        <ProviderBadge provider="flashscore" copy={copy} />{" "}
                        <NameText>{candidate?.displayName ?? "—"}</NameText>
                      </td>
                      <td className="p-2">
                        <AdminDatum>{row.externalId}</AdminDatum>
                      </td>
                      <td className="p-2" data-testid="bulk-row-supporting">
                        <AdminDatum>{row.supporting.externalId}</AdminDatum>
                      </td>
                      <td className="p-2">{copy.clubLabel(observation?.clubKey ?? null)}</td>
                      <td className="p-2" data-testid="bulk-row-class">
                        {f.classShort[row.evidenceClass]}
                      </td>
                      <td className="p-2" data-testid="bulk-row-evidence">
                        <ul className="grid gap-0.5">
                          <li>
                            {evidence.shirt === "agree"
                              ? f.evidence.shirtAgrees
                              : f.evidence.shirtNoAgreement}
                          </li>
                          <li>{f.evidence.events(evidence.alignedEventCount)}</li>
                          {evidence.dateCorroboration === "AGREE" && (
                            <li>{f.evidence.birthDateAgrees}</li>
                          )}
                        </ul>
                      </td>
                      {targetCell(row)}
                      {stateCell(row)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {batch.last && (
            <div data-testid="bulk-result">
              <AdminNotice
                tone={batch.last.aborted ? "alert" : "info"}
                role={batch.last.aborted ? "alert" : "status"}
              >
                <strong className="block">{b.result.heading}</strong>
                {batch.last.aborted
                  ? b.result.aborted(batch.last.aborted.code)
                  : b.result.acted(batch.last.outcomes.filter((o) => o.acted).length)}
              </AdminNotice>
            </div>
          )}

          {(["propose", "approve", "execute"] as const satisfies readonly BulkPhase[]).map(
            (phase) => {
              const text = b.phases[phase];
              const ready =
                phase === "propose"
                  ? batch.inState("NOT_PROPOSED")
                  : phase === "approve"
                    ? batch.inState("PROPOSED")
                    : approvedCount;
              return (
                <PhaseControl
                  key={phase}
                  phase={phase}
                  heading={text.heading}
                  what={text.what}
                  button={text.button}
                  runningLabel={text.running}
                  typeLabel={text.typeLabel}
                  hint={text.typeHint(batch.phrases[phase])}
                  phrase={batch.phrases[phase]}
                  readyText={text.ready(ready)}
                  ready={ready}
                  running={batch.running}
                  disabledReason={
                    phase === "approve" && !selfApprovalAllowed ? b.selfApprovalOff : null
                  }
                  onRun={() => void batch.run(phase)}
                >
                  {phase === "propose" && flashManifest && (
                    <p
                      className={cn(ui.text.secondary, ui.tone.default)}
                      data-testid="bulk-propose-calls"
                    >
                      {f.proposeCalls(proposeCalls)}
                    </p>
                  )}
                  {phase === "execute" && (
                    <dl className="grid gap-1" data-testid="bulk-execute-summary">
                      <p className={cn(ui.text.label, ui.tone.muted)}>{b.executeSummary.heading}</p>
                      <SummaryLine
                        label={b.executeSummary.approved}
                        value={String(approvedCount)}
                        testId="bulk-sum-approved"
                      />
                      <SummaryLine
                        label={b.executeSummary.skipped}
                        value={String(batch.counts.NOT_PROPOSED + batch.counts.PROPOSED)}
                        testId="bulk-sum-skipped"
                      />
                      <SummaryLine
                        label={b.executeSummary.heldStale}
                        value={String(HELD_STATES.reduce((n, s) => n + batch.counts[s], 0))}
                        testId="bulk-sum-held"
                      />
                      <SummaryLine
                        label={b.executeSummary.hash}
                        value={manifest.manifestSha256}
                        testId="bulk-sum-hash"
                      />
                      <p
                        className={cn(ui.text.secondary, ui.tone.default)}
                        data-testid="bulk-sum-expected"
                      >
                        {b.executeSummary.expected(mappedNow, mappedNow + approvedCount)}
                      </p>
                    </dl>
                  )}
                </PhaseControl>
              );
            },
          )}
        </>
      )}
    </section>
  );
}

function SummaryLine({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      <dt className={cn(ui.text.secondary, ui.tone.muted)}>{label}</dt>
      <dd className={cn("min-w-0 break-all", ui.text.secondary, ui.tone.default)}>{value}</dd>
    </div>
  );
}

/** One of the three separate actions: its own typed phrase, its own button, nothing automatic. */
function PhaseControl({
  phase,
  heading,
  what,
  button,
  runningLabel,
  typeLabel,
  hint,
  phrase,
  readyText,
  ready,
  running,
  disabledReason,
  onRun,
  children,
}: {
  phase: BulkPhase;
  heading: string;
  what: string;
  button: string;
  runningLabel: string;
  typeLabel: string;
  hint: string;
  phrase: string;
  readyText: string;
  ready: number;
  running: BulkPhase | null;
  disabledReason: string | null;
  onRun: () => void;
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const isRunning = running === phase;
  const armed = typed.trim() === phrase && ready > 0 && running === null && disabledReason === null;
  return (
    <section
      className="grid gap-3 rounded-[var(--ui-radius-control,0.75rem)] border border-[color:var(--ui-border)] p-3"
      data-testid={`bulk-phase-${phase}`}
    >
      <h4 className={cn(ui.text.bodyStrong, ui.tone.default)}>{heading}</h4>
      <p className={cn(ui.text.secondary, ui.tone.muted)}>{what}</p>
      <p className={cn(ui.text.secondary, ui.tone.default)} data-testid={`bulk-ready-${phase}`}>
        {readyText}
      </p>
      {children}
      {disabledReason && (
        <AdminNotice tone="alert" role="status" testId={`bulk-disabled-${phase}`}>
          {disabledReason}
        </AdminNotice>
      )}
      {/* No <form>: Enter in the field never runs anything. Only the button does. */}
      <UiInput
        label={typeLabel}
        hint={hint}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        disabled={running !== null}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        dir="ltr"
        data-testid={`bulk-input-${phase}`}
      />
      <div>
        <UiButton
          size="sm"
          variant="gradient"
          className="w-full sm:w-auto"
          disabled={!armed}
          onClick={() => {
            // Re-checked here and not only through `disabled`.
            if (typed.trim() !== phrase || running !== null || ready === 0) return;
            setTyped("");
            onRun();
          }}
          data-testid={`bulk-run-${phase}`}
        >
          {isRunning ? runningLabel : button}
        </UiButton>
      </div>
    </section>
  );
}
