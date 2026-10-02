import { useReducer, useState } from "react";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  AppPlayerOption,
  CandidateDto,
  ProposalDto,
  ReviewerAvailability,
} from "@/backend/football/identity/mapping-contracts";
import { mapMappingError } from "@/backend/football/identity/mapping-errors";
import type { PlayerMappingRepository } from "@/backend/football/identity/mapping-repository";
import {
  classifyPreview,
  clubContexts,
  evidenceStrength,
  readOptionSignals,
  summarizeCandidate,
  type OptionScope,
} from "@/backend/football/identity/review-queue";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import {
  ADMIN_PANEL_CLASS,
  AdminEmptyState,
  AdminNotice,
  AdminSkeletonList,
} from "@/components/admin/AdminSurfaces";
import {
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
} from "@/components/admin/destructive-action";
import { ui, UiBadge, UiButton, UiChip } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { mappingErrorMessage, type Lang, type PlayerMappingCopy } from "./copy";
import {
  AdminDatum,
  Fact,
  FlagBadges,
  UtcDate,
  NameText,
  PreviewBadge,
  ProviderBadge,
  SignalPill,
} from "./parts";
import { ProposalPanel, REASON_MIN, type MappingViewer } from "./ProposalPanel";
import { useCandidateOptions, type MappingActions } from "./use-player-mappings";

/** How many options show before "see the others". Every option is still one click away. */
const INITIAL_OPTIONS = 10;

/**
 * One candidate against the app's players.
 *
 * Left of the page (start in RTL): what the provider observed, in words a
 * reviewer can check. Below it: EVERY app player of the club, ranked by
 * agreement, lower ranks included. Position never hides anyone: a position
 * disagreement is a visible amber flag on the row, and a missing value is
 * "no signal", never a minus. A name is shown to be read; it ranks nothing.
 */
export function CandidateComparison({
  candidate,
  openProposal,
  availability,
  viewer,
  lang,
  copy,
  writesEnabled,
  actions,
  repository,
  context,
  preloadedOptions,
  onChanged,
  onClose,
}: {
  candidate: CandidateDto;
  openProposal: ProposalDto | null;
  availability: ReviewerAvailability;
  viewer: MappingViewer;
  lang: Lang;
  copy: PlayerMappingCopy;
  writesEnabled: boolean;
  actions: MappingActions;
  repository: PlayerMappingRepository | null;
  context: RepositoryContext;
  /** Sample options for a static render; the screen asks the repository otherwise. */
  preloadedOptions?: readonly AppPlayerOption[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const rtl = lang === "ar";
  const d = copy.detail;
  const [scope, setScope] = useState<OptionScope>("club");
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [action, dispatch] = useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION);
  const [message, setMessage] = useState<{ tone: "info" | "alert"; text: string } | null>(null);
  const optionsState = useCandidateOptions(repository, context, candidate, scope, preloadedOptions);

  const summary = summarizeCandidate(candidate);
  const clubs = clubContexts(candidate);
  const incomplete = candidate.flags.includes("INCOMPLETE_PROVIDER_SQUAD");
  const options = optionsState.status === "ready" ? optionsState.data : [];
  const preview = optionsState.status === "ready" ? classifyPreview(candidate, options) : null;
  const selected = options.find((o) => o.appPlayerId === selectedId) ?? null;
  const selectedSignals = selected ? readOptionSignals(selected.signals) : null;
  const visible = showAll ? options : options.slice(0, INITIAL_OPTIONS);

  const canPropose =
    writesEnabled && viewer.canManage && candidate.status === "unmapped" && openProposal === null;

  return (
    <section
      className="grid gap-4"
      aria-labelledby={`candidate-${candidate.id}-title`}
      data-testid="mapping-comparison"
      data-candidate-id={candidate.id}
    >
      <header className="flex flex-wrap items-center gap-2">
        <UiButton
          variant="outline"
          size="sm"
          onClick={onClose}
          data-testid="mapping-comparison-close"
        >
          {d.close}
        </UiButton>
        <h3
          id={`candidate-${candidate.id}-title`}
          className={cn(ui.display.section, ui.tone.default)}
        >
          <NameText>{candidate.displayName ?? d.none}</NameText>
        </h3>
        <ProviderBadge provider={candidate.provider} copy={copy} />
        <UiBadge tone="neutral">{copy.statuses[candidate.status] ?? candidate.status}</UiBadge>
      </header>

      {/* ---- the provider's side ---- */}
      <section
        className={cn(ADMIN_PANEL_CLASS, "grid gap-3 p-4")}
        aria-label={d.providerEvidence}
        data-testid="mapping-provider-evidence"
      >
        <h4 className={cn(ui.text.bodyStrong, ui.tone.default)}>{d.providerEvidence}</h4>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label={d.name}>
            <NameText>{candidate.displayName ?? d.none}</NameText>
          </Fact>
          <Fact label={d.providerId}>
            <AdminDatum>{candidate.externalId}</AdminDatum>
          </Fact>
          <Fact label={d.clubs}>
            {clubs.map((c) => copy.clubLabel(c.clubKey)).join(" · ") || d.none}{" "}
            <span className={ui.tone.muted}>({d.observations(candidate.observations.length)})</span>
          </Fact>
          <Fact label={d.shirt}>
            {summary.shirts.length > 0 ? summary.shirts.join(", ") : d.none}
          </Fact>
          <Fact label={d.position}>
            {summary.positions.length > 0
              ? summary.positions.map((position) => copy.positions[position]).join(", ")
              : d.none}
          </Fact>
          <Fact label={d.dob} testId="mapping-dob-state">
            {summary.dobStates.map((state) => d.dobStates[state] ?? state).join(", ") || d.none}
          </Fact>
          <Fact label={d.height}>
            {summary.heightCm !== null ? (
              <AdminDatum mono={false}>{`${summary.heightCm} cm`}</AdminDatum>
            ) : (
              d.none
            )}
          </Fact>
          <Fact label={d.nationality}>{summary.nationality ?? d.none}</Fact>
          <Fact label={d.squad} testId="mapping-squad-state">
            {incomplete ? d.squadIncomplete : d.squadComplete}
          </Fact>
          <Fact label={copy.filters.evidence}>{copy.evidence[evidenceStrength(candidate)]}</Fact>
          <Fact label={d.observedAt}>
            <UtcDate iso={candidate.observations[0]?.observedAt ?? null} />
          </Fact>
        </dl>
        <FlagBadges flags={candidate.flags} copy={copy} testId="mapping-candidate-flags" />
        {incomplete && (
          <p className={cn(ui.text.secondary, ui.tone.muted)} data-testid="mapping-incomplete-note">
            {d.squadIncompleteHelp}
          </p>
        )}
        {preview && (
          <div className="grid gap-1" data-testid="mapping-preview">
            <p className={cn(ui.text.label, ui.tone.muted)}>{d.previewTitle}</p>
            <div className="flex flex-wrap items-center gap-2">
              <PreviewBadge category={preview.category} copy={copy} />
            </div>
            <ul className={cn("list-disc ps-5", ui.text.meta, ui.tone.muted)}>
              {preview.reasons.map((reason) => (
                <li key={reason}>{d.previewReasons[reason]}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---- an open proposal for this candidate ---- */}
      {openProposal && (
        <ProposalPanel
          proposal={openProposal}
          availability={availability}
          viewer={viewer}
          lang={lang}
          copy={copy}
          writesEnabled={writesEnabled}
          actions={actions}
          onChanged={onChanged}
        />
      )}

      {/* ---- the app's side ---- */}
      <section className="grid gap-3" aria-label={d.appPlayers} data-testid="mapping-options">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className={cn(ui.text.bodyStrong, ui.tone.default)}>{d.appPlayers}</h4>
          <div role="group" aria-label={d.scopeLabel} className="flex gap-2">
            <UiChip
              selected={scope === "club"}
              onClick={() => setScope("club")}
              data-testid="mapping-scope-club"
            >
              {d.scopeClub}
            </UiChip>
            <UiChip
              selected={scope === "all"}
              onClick={() => setScope("all")}
              data-testid="mapping-scope-all"
            >
              {d.scopeAll}
            </UiChip>
          </div>
        </div>
        <p className={cn(ui.text.meta, ui.tone.muted)}>{d.lowerRankedNote}</p>

        {optionsState.status === "loading" && (
          <AdminSkeletonList rows={4} testId="mapping-options-loading" />
        )}
        {optionsState.status === "error" && (
          <AdminNotice tone="alert" role="alert" testId="mapping-options-error">
            {d.optionsFailed(optionsState.code)}
          </AdminNotice>
        )}
        {optionsState.status === "ready" && options.length === 0 && (
          <AdminEmptyState testId="mapping-options-empty">{d.optionsNone}</AdminEmptyState>
        )}
        {options.length > 0 && (
          <ol className="grid gap-2" data-testid="mapping-options-list">
            {visible.map((option, index) => {
              const signals = readOptionSignals(option.signals);
              const isSelected = option.appPlayerId === selectedId;
              return (
                <li
                  key={option.appPlayerId}
                  className={cn(
                    "grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center",
                    ADMIN_PANEL_CLASS,
                    isSelected && "ring-2 ring-[color:var(--ui-ink)]",
                  )}
                  data-testid="mapping-option"
                  data-app-player-id={option.appPlayerId}
                  data-position-conflict={signals.position === "conflict" ? "true" : undefined}
                >
                  <div className="grid gap-1.5 min-w-0">
                    <p className={cn(ui.text.bodyStrong, ui.tone.default)}>
                      <span className={cn(ui.text.meta, ui.tone.muted)}>
                        {d.rank(index + 1)} ·{" "}
                      </span>
                      <NameText>{option.displayName}</NameText>
                      <span className={cn(ui.text.meta, ui.tone.muted)}>
                        {" · "}
                        {option.position ? copy.positions[option.position] : copy.row.noPosition}
                        {" · "}
                        {d.score} {option.score}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SignalPill kind={signals.dob} label={d.signalDob} copy={copy} />
                      <SignalPill kind={signals.shirt} label={d.signalShirt} copy={copy} />
                      <SignalPill kind={signals.position} label={d.signalPosition} copy={copy} />
                      {signals.position === "conflict" && (
                        <UiBadge tone="caution">
                          <span data-testid="mapping-position-flag">{d.positionDisagreement}</span>
                        </UiBadge>
                      )}
                      {signals.club === "mismatch" && (
                        <UiBadge tone="caution">
                          <span data-testid="mapping-club-flag" data-club="mismatch">
                            {d.clubMismatch}
                          </span>
                        </UiBadge>
                      )}
                      {signals.club === "no_signal" && scope === "all" && (
                        <UiBadge tone="neutral">
                          <span data-testid="mapping-club-unknown" data-club="no_signal">
                            {d.clubUnknown}
                          </span>
                        </UiBadge>
                      )}
                      {option.alreadyMappedForProvider && (
                        <UiBadge tone="negative">{d.alreadyMapped}</UiBadge>
                      )}
                    </div>
                  </div>
                  {canPropose && !option.alreadyMappedForProvider && (
                    <UiButton
                      size="sm"
                      variant={isSelected ? "ink" : "outline"}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedId(isSelected ? null : option.appPlayerId)}
                      data-testid="mapping-option-select"
                    >
                      {isSelected ? d.selected : d.select}
                    </UiButton>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {options.length > INITIAL_OPTIONS && (
          <UiButton
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => setShowAll((v) => !v)}
            data-testid="mapping-options-toggle"
          >
            {showAll ? d.showFewer : d.showMore(options.length - INITIAL_OPTIONS)}
          </UiButton>
        )}
      </section>

      {/* ---- propose ---- */}
      <section
        className={cn(ADMIN_PANEL_CLASS, "grid gap-3 p-4")}
        aria-label={copy.propose.title}
        data-testid="mapping-propose"
      >
        <h4 className={cn(ui.text.bodyStrong, ui.tone.default)}>{copy.propose.title}</h4>
        {!writesEnabled && (
          <p className={cn(ui.text.secondary, ui.tone.muted)} data-testid="mapping-writes-disabled">
            {copy.writesDisabled}
          </p>
        )}
        {writesEnabled && !viewer.canManage && (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>{copy.noPermission}</p>
        )}
        {writesEnabled && viewer.canManage && openProposal !== null && (
          <p className={cn(ui.text.secondary, ui.tone.muted)}>{copy.propose.alreadyProposed}</p>
        )}
        {writesEnabled &&
          viewer.canManage &&
          openProposal === null &&
          candidate.status !== "unmapped" && (
            <p className={cn(ui.text.secondary, ui.tone.muted)}>{copy.propose.notUnmapped}</p>
          )}
        {canPropose && (
          <>
            <p
              className={cn(ui.text.secondary, ui.tone.default)}
              aria-live="polite"
              data-testid="mapping-chosen"
            >
              {copy.propose.chosen} :{" "}
              {selected ? (
                <NameText>{selected.displayName}</NameText>
              ) : (
                <span className={ui.tone.muted}>{copy.propose.noneChosen}</span>
              )}
            </p>
            {selectedSignals?.position === "conflict" && (
              <AdminNotice tone="alert" role="status">
                {copy.propose.positionWarning}
              </AdminNotice>
            )}
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {copy.propose.creates} {copy.propose.reasonHelp}
            </p>
            <AdminDestructiveAction
              actionKey={`propose:${candidate.id}`}
              state={action}
              dispatch={dispatch}
              minimumReasonLength={REASON_MIN}
              rtl={rtl}
              tone="primary"
              disabled={selected === null}
              testId="mapping-propose-action"
              triggerTestId="mapping-propose-trigger"
              triggerLabel={copy.propose.trigger}
              confirmLabel={copy.propose.confirmLabel}
              confirmPrompt={copy.propose.confirmPrompt}
              onConfirm={async (reason) => {
                if (!selected) return;
                setMessage(null);
                try {
                  await actions.propose(candidate, selected.appPlayerId, reason);
                  setMessage({ tone: "info", text: copy.propose.done });
                  setSelectedId(null);
                  onChanged();
                } catch (error) {
                  setMessage({
                    tone: "alert",
                    text: mappingErrorMessage(copy, mapMappingError(error).code),
                  });
                }
              }}
            />
          </>
        )}
        {message && (
          <AdminNotice
            tone={message.tone}
            role={message.tone === "alert" ? "alert" : "status"}
            testId="mapping-propose-message"
          >
            {message.text}
          </AdminNotice>
        )}
      </section>
    </section>
  );
}
