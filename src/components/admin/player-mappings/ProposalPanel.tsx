import { useReducer, useState } from "react";
import type {
  CandidateDto,
  ProposalDto,
  ReviewerAvailability,
} from "@/backend/football/identity/mapping-contracts";
import { mapMappingError } from "@/backend/football/identity/mapping-errors";
import { dualControlFor, readOptionSignals } from "@/backend/football/identity/review-queue";
import { AdminDestructiveAction } from "@/components/admin/AdminDestructiveAction";
import { refusedWith, screenNoticeFor } from "@/components/admin/admin-refusal";
import { ADMIN_PANEL_CLASS, AdminNotice } from "@/components/admin/AdminSurfaces";
import {
  destructiveActionReducer,
  IDLE_DESTRUCTIVE_ACTION,
} from "@/components/admin/destructive-action";
import { ui, UiBadge, UiButton, UiCheckbox, UiTextarea } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { mappingErrorMessage, type Lang, type PlayerMappingCopy } from "./copy";
import { canOfferExecute } from "./execute-confirmation";
import { ExecuteMapping } from "./ExecuteMapping";
import { AdminDatum, Fact, SignalPill, UtcDate } from "./parts";
import type { MappingActions } from "./use-player-mappings";

/** The server's floor for a reason or a note, mirrored only to explain a disabled button. */
export const REASON_MIN = 10;

export interface MappingViewer {
  /** Holds football.manage_mappings. The database checks it again on every call. */
  readonly canManage: boolean;
}

function statusTone(status: string) {
  if (status === "approved" || status === "executed") return "positive" as const;
  if (status === "pending") return "caution" as const;
  if (status === "rejected" || status === "cancelled" || status === "expired")
    return "neutral" as const;
  return "caution" as const; // held states: a person must look
}

type Message = { readonly tone: "info" | "alert"; readonly text: string } | null;

/**
 * One proposal, and the two-person rule drawn faithfully:
 *
 *  - the proposer sees their own proposal and may withdraw it, add the note a
 *    position disagreement needs, or refresh stale evidence. They are never
 *    offered approve or reject, and the database would refuse them anyway;
 *  - a DIFFERENT qualified person sees the exact fingerprint and may approve
 *    or reject that fingerprint, with a reason of their own;
 *  - when nobody else is qualified the proposal says SECOND QUALIFIED REVIEWER
 *    REQUIRED and offers no way round it;
 *  - approving executes nothing. An approved proposal offers ONE explicit,
 *    typed execute step (see ExecuteMapping), which is the reviewed execute RPC.
 */
export function ProposalPanel({
  proposal,
  candidate = null,
  availability,
  viewer,
  lang,
  copy,
  writesEnabled,
  actions,
  onChanged,
  onExecuted,
}: {
  proposal: ProposalDto;
  /** The candidate the proposal names, when the queue has it: a readable label, nothing more. */
  candidate?: CandidateDto | null;
  availability: ReviewerAvailability;
  viewer: MappingViewer;
  lang: Lang;
  copy: PlayerMappingCopy;
  writesEnabled: boolean;
  actions: MappingActions;
  onChanged: () => void;
  /** An execution succeeded: the screen keeps this sentence, because this panel goes away. */
  onExecuted?: (result: string) => void;
}) {
  const rtl = lang === "ar";
  const [action, dispatch] = useReducer(destructiveActionReducer, IDLE_DESTRUCTIVE_ACTION);
  const [message, setMessage] = useState<Message>(null);
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const control = dualControlFor(proposal, availability, viewer);
  const p = copy.proposal;

  /** `fromConfirmStep`: the work was confirmed in an `AdminDestructiveAction`,
   *  which keeps the motive on a refusal and shows its own "Se reconnecter"
   *  prompt for a stale sign-in, so this panel does not say that one twice. */
  const run = async (work: () => Promise<void>, fromConfirmStep = false) => {
    setMessage(null);
    setBusy(true);
    try {
      await work();
      setMessage({ tone: "info", text: p.done });
      onChanged();
    } catch (error) {
      const code = mapMappingError(error).code;
      const text = mappingErrorMessage(copy, code);
      const shown = fromConfirmStep ? screenNoticeFor(code, text) : text;
      setMessage(shown ? { tone: "alert", text: shown } : null);
      return refusedWith(code);
    } finally {
      setBusy(false);
    }
  };

  const effective = proposal.effectiveStatus;
  const needsNote = proposal.status === "position_disagreement";
  const canActAsProposer = proposal.proposedByMe && viewer.canManage && writesEnabled;
  const signalsByProvider = Object.entries(proposal.signals).filter(
    ([, value]) => typeof value === "object" && value !== null,
  ) as [string, Record<string, unknown>][];
  const evidenceCandidates = Array.isArray(
    (proposal.evidence as { candidates?: unknown }).candidates,
  )
    ? (
        proposal.evidence as {
          candidates: { provider?: string; externalId?: string; observationCount?: number }[];
        }
      ).candidates
    : [];

  return (
    <section
      className={cn(ADMIN_PANEL_CLASS, "grid gap-4 p-4")}
      aria-labelledby={`proposal-${proposal.id}-title`}
      data-testid="mapping-proposal"
      data-proposal-status={effective}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h4
          id={`proposal-${proposal.id}-title`}
          className={cn(ui.text.bodyStrong, ui.tone.default)}
        >
          {p.title}
        </h4>
        <UiBadge tone={statusTone(effective)}>
          <span data-testid="mapping-proposal-status">
            {copy.proposalStatuses[effective] ?? effective}
          </span>
        </UiBadge>
        <UiBadge tone="outline">{copy.proposalKinds[proposal.kind] ?? proposal.kind}</UiBadge>
      </header>

      {control.showSecondReviewerRequired && (
        <div data-testid="second-reviewer-required">
          <AdminNotice tone="alert" role="alert">
            <strong className="block">{p.secondReviewerRequired}</strong>
            <span className="block">{p.secondReviewerRequiredHelp}</span>
          </AdminNotice>
        </div>
      )}

      {proposal.proposedByMe &&
        proposal.status === "pending" &&
        effective !== "expired" &&
        (control.canDecide ? (
          <div data-testid="mapping-self-approval-notice">
            <AdminNotice tone="alert" role="status">
              {p.selfApprovalNotice}
            </AdminNotice>
          </div>
        ) : (
          <p className={cn(ui.text.secondary, ui.tone.muted)} data-testid="mapping-own-proposal">
            {p.ownProposal} {p.waitingOther}
          </p>
        ))}
      {proposal.selfApproved && (
        <p
          className={cn(ui.text.secondary, ui.tone.muted)}
          data-testid="mapping-self-approved-note"
        >
          {p.selfApprovedNote}
        </p>
      )}
      {effective === "expired" && (
        <AdminNotice tone="alert" role="status">
          {p.expired}
        </AdminNotice>
      )}
      {control.blockedBy === "held" && effective !== "expired" && (
        <AdminNotice tone="alert" role="status">
          {p.held}
          {proposal.holdCode ? ` (${p.holdCode} : ${proposal.holdCode})` : ""}
        </AdminNotice>
      )}
      {proposal.status === "approved" && (
        <p
          className={cn(ui.text.secondary, ui.tone.muted)}
          data-testid="mapping-execution-separate"
        >
          {p.executionSeparate}
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label={p.by}>{proposal.proposedByMe ? p.you : p.someoneElse}</Fact>
        <Fact label={p.basis}>
          <AdminDatum mono={false}>{proposal.basis}</AdminDatum>
        </Fact>
        <Fact label={p.requestedAt}>
          <UtcDate iso={proposal.requestedAt} />
        </Fact>
        <Fact label={p.expiresAt}>
          <UtcDate iso={proposal.expiresAt} />
        </Fact>
        <Fact label={p.reason}>
          <span className="break-words">{proposal.reason}</span>
        </Fact>
        {proposal.positionNote && (
          <Fact label={p.positionNote}>
            <span className="break-words">{proposal.positionNote}</span>
          </Fact>
        )}
        {proposal.decisionReason && (
          <Fact label={p.decisionReason}>
            <span className="break-words">{proposal.decisionReason}</span>
          </Fact>
        )}
      </dl>

      <div>
        <p className={cn(ui.text.label, ui.tone.muted)}>{p.fingerprint}</p>
        <p className="mt-0.5" data-testid="mapping-fingerprint">
          <AdminDatum className={cn(ui.text.meta, ui.tone.default)}>
            {proposal.fingerprint}
          </AdminDatum>
        </p>
        <p className={cn("mt-1", ui.text.meta, ui.tone.muted)}>{p.fingerprintHelp}</p>
      </div>

      {(evidenceCandidates.length > 0 || signalsByProvider.length > 0) && (
        <div className="grid gap-3">
          <p className={cn(ui.text.label, ui.tone.muted)}>{p.evidence}</p>
          {evidenceCandidates.map((c, index) => (
            <p key={index} className={cn(ui.text.secondary, ui.tone.default)}>
              <span>
                {c.provider
                  ? (copy.providers[c.provider as "sofascore" | "flashscore"] ?? c.provider)
                  : ""}
              </span>{" "}
              <AdminDatum>{c.externalId ?? ""}</AdminDatum>
            </p>
          ))}
          {signalsByProvider.map(([provider, raw]) => {
            const signals = readOptionSignals(raw);
            return (
              <div
                key={provider}
                className="flex flex-wrap items-center gap-1.5"
                data-testid="mapping-proposal-signals"
              >
                <span className={cn(ui.text.meta, ui.tone.muted)}>
                  {copy.providers[provider as "sofascore" | "flashscore"] ?? provider} · {p.signals}
                </span>
                <SignalPill kind={signals.dob} label={copy.detail.signalDob} copy={copy} />
                <SignalPill kind={signals.shirt} label={copy.detail.signalShirt} copy={copy} />
                <SignalPill
                  kind={signals.position}
                  label={copy.detail.signalPosition}
                  copy={copy}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* ---- actions ---- */}
      {!writesEnabled && (
        <p className={cn(ui.text.secondary, ui.tone.muted)} data-testid="mapping-writes-disabled">
          {copy.writesDisabled}
        </p>
      )}
      {writesEnabled && !viewer.canManage && (
        <p className={cn(ui.text.secondary, ui.tone.muted)}>{copy.noPermission}</p>
      )}

      {canActAsProposer && needsNote && (
        <div className="grid gap-2" data-testid="mapping-note-form">
          <p className={cn(ui.text.secondary, ui.tone.default)}>{p.noteNeeded}</p>
          <UiTextarea
            label={p.noteLabel}
            placeholder={p.notePlaceholder}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            minLength={REASON_MIN}
            maxLength={500}
            rows={3}
            data-testid="mapping-note-input"
          />
          <UiButton
            size="sm"
            className="w-full sm:w-auto"
            disabled={busy || note.trim().length < REASON_MIN}
            onClick={() => run(() => actions.addNote(proposal, note.trim()))}
            data-testid="mapping-note-save"
          >
            {p.noteSave}
          </UiButton>
        </div>
      )}

      {canActAsProposer && proposal.status === "stale_evidence" && (
        <div className="grid gap-2">
          <p className={cn(ui.text.secondary, ui.tone.default)}>{p.staleHelp}</p>
          <UiButton
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={() => run(() => actions.refreshEvidence(proposal))}
            data-testid="mapping-refresh-evidence"
          >
            {p.refreshEvidence}
          </UiButton>
        </div>
      )}

      {writesEnabled && control.canDecide && (
        <div className="grid gap-3" data-testid="mapping-decision">
          {proposal.positionDisagreement && (
            <UiCheckbox
              label={p.acknowledge}
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              data-testid="mapping-acknowledge"
            />
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <AdminDestructiveAction
              actionKey={`approve:${proposal.id}`}
              state={action}
              dispatch={dispatch}
              minimumReasonLength={REASON_MIN}
              rtl={rtl}
              tone="primary"
              disabled={busy || (proposal.positionDisagreement && !acknowledged)}
              testId="mapping-approve"
              triggerTestId="mapping-approve"
              triggerLabel={p.approve}
              confirmLabel={p.approveConfirm}
              confirmPrompt={p.approvePrompt(proposal.fingerprint)}
              onConfirm={(reason) =>
                run(() => actions.decide(proposal, "approve", reason, acknowledged), true)
              }
            />
            <AdminDestructiveAction
              actionKey={`reject:${proposal.id}`}
              state={action}
              dispatch={dispatch}
              minimumReasonLength={REASON_MIN}
              rtl={rtl}
              disabled={busy}
              testId="mapping-reject"
              triggerTestId="mapping-reject"
              triggerLabel={p.reject}
              confirmLabel={p.rejectConfirm}
              confirmPrompt={p.rejectPrompt}
              onConfirm={(reason) =>
                run(() => actions.decide(proposal, "reject", reason, false), true)
              }
            />
          </div>
        </div>
      )}

      {writesEnabled && viewer.canManage && canOfferExecute(proposal) && (
        <ExecuteMapping
          proposal={proposal}
          candidate={candidate}
          copy={copy}
          actions={actions}
          onChanged={onChanged}
          onExecuted={onExecuted}
        />
      )}

      {canActAsProposer &&
        ["pending", "position_disagreement", "stale_evidence", "approved"].includes(
          proposal.status,
        ) &&
        effective !== "expired" && (
          <AdminDestructiveAction
            actionKey={`cancel:${proposal.id}`}
            state={action}
            dispatch={dispatch}
            minimumReasonLength={REASON_MIN}
            rtl={rtl}
            disabled={busy}
            testId="mapping-cancel"
            triggerTestId="mapping-cancel"
            triggerLabel={p.cancel}
            confirmLabel={p.cancelConfirm}
            confirmPrompt={p.cancelPrompt}
            onConfirm={(reason) => run(() => actions.cancel(proposal, reason), true)}
          />
        )}

      {message && (
        <AdminNotice
          tone={message.tone}
          role={message.tone === "alert" ? "alert" : "status"}
          testId="mapping-proposal-message"
        >
          {message.text}
        </AdminNotice>
      )}
    </section>
  );
}
