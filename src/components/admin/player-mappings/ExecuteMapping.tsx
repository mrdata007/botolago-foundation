import { useState } from "react";
import type { CandidateDto, ProposalDto } from "@/backend/football/identity/mapping-contracts";
import { mapMappingError } from "@/backend/football/identity/mapping-errors";
import { AdminNotice } from "@/components/admin/AdminSurfaces";
import { ui, UiButton, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { mappingErrorMessage, type PlayerMappingCopy } from "./copy";
import { EXECUTE_CONFIRMATION_PHRASE, isConfirmationTyped } from "./execute-confirmation";
import { AdminDatum, Fact } from "./parts";
import type { MappingActions } from "./use-player-mappings";

type Message = { readonly tone: "info" | "alert"; readonly text: string } | null;

/**
 * Execute ONE approved proposal, on purpose.
 *
 *  - drawn only for an approved, unexpired proposal, only for a person who may
 *    manage mappings, only when proposals are enabled;
 *  - shows the exact fingerprint and the target before anything runs;
 *  - the button stays disabled until the phrase is typed exactly; there is no
 *    automatic execution after approval and no way to execute several at once;
 *  - the call is the reviewed `admin_football_mapping_execute` RPC through the
 *    screen's actions: the database still requires an authenticated staff
 *    session, AAL2 and a recent sign-in, re-checks the fingerprint and the
 *    evidence, and refuses a second execution. Nothing here weakens those.
 */
export function ExecuteMapping({
  proposal,
  candidate,
  copy,
  actions,
  onChanged,
  onExecuted,
}: {
  proposal: ProposalDto;
  /** The candidate this proposal names, when the queue has it (for a readable label only). */
  candidate: CandidateDto | null;
  copy: PlayerMappingCopy;
  actions: MappingActions;
  onChanged: () => void;
  /** Called once an execution succeeded, with the sentence to keep on screen: the panel itself goes away. */
  onExecuted?: (result: string) => void;
}) {
  const e = copy.proposal.execute;
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const armed = isConfirmationTyped(typed) && !busy;

  // The proposal's own fields first; the queue's candidate only fills a gap in a label.
  const providerKey = proposal.sofascoreExternalId
    ? "sofascore"
    : proposal.flashscoreExternalId
      ? "flashscore"
      : ((proposal.providerName as "sofascore" | "flashscore" | null) ??
        (proposal.sofascoreCandidateId
          ? "sofascore"
          : proposal.flashscoreCandidateId
            ? "flashscore"
            : null));
  const externalId =
    proposal.sofascoreExternalId ??
    proposal.flashscoreExternalId ??
    proposal.newExternalId ??
    candidate?.externalId ??
    null;
  const appPlayerId = proposal.appPlayerId ?? proposal.newAppPlayerId ?? null;

  const run = async () => {
    // Re-checked here and not only through `disabled`.
    if (!isConfirmationTyped(typed) || busy) return;
    setMessage(null);
    setBusy(true);
    try {
      await actions.execute(proposal);
      setTyped("");
      setMessage({ tone: "info", text: e.done });
      onExecuted?.(
        e.result(
          copy.providers[providerKey ?? "sofascore"] ?? String(providerKey),
          externalId ?? "",
          appPlayerId ?? "",
        ),
      );
      onChanged();
    } catch (error) {
      setMessage({ tone: "alert", text: mappingErrorMessage(copy, mapMappingError(error).code) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="grid gap-3 rounded-[var(--ui-radius-control,0.75rem)] border border-[color:var(--ui-border)] p-3"
      aria-labelledby={`execute-${proposal.id}-title`}
      data-testid="mapping-execute-panel"
    >
      <h5 id={`execute-${proposal.id}-title`} className={cn(ui.text.bodyStrong, ui.tone.default)}>
        {e.title}
      </h5>
      <p className={cn(ui.text.secondary, ui.tone.muted)}>{e.intro}</p>

      <div>
        <p className={cn(ui.text.label, ui.tone.muted)}>{copy.proposal.fingerprint}</p>
        <p className="mt-0.5" data-testid="mapping-execute-fingerprint">
          <AdminDatum className={cn(ui.text.meta, ui.tone.default)}>
            {proposal.fingerprint}
          </AdminDatum>
        </p>
      </div>

      <div>
        <p className={cn(ui.text.label, ui.tone.muted)}>{e.targetHeading}</p>
        <dl className="mt-1 grid gap-2 sm:grid-cols-2" data-testid="mapping-execute-target">
          <Fact label={e.kind}>
            <AdminDatum mono={false}>
              {copy.proposalKinds[proposal.kind] ?? proposal.kind}
            </AdminDatum>
          </Fact>
          {providerKey && (
            <Fact label={e.provider}>
              <span data-testid="mapping-execute-provider">
                {copy.providers[providerKey] ?? providerKey}
              </span>
            </Fact>
          )}
          {externalId && (
            <Fact label={e.externalId}>
              <span data-testid="mapping-execute-external-id">
                <AdminDatum>{externalId}</AdminDatum>
              </span>
            </Fact>
          )}
          {appPlayerId && (
            <Fact label={e.appPlayer}>
              <span data-testid="mapping-execute-app-player">
                <AdminDatum>{appPlayerId}</AdminDatum>
              </span>
            </Fact>
          )}
          {candidate && (
            <Fact label={e.candidate}>
              <span className="break-words" data-testid="mapping-execute-candidate">
                {candidate.displayName ?? candidate.externalId}
              </span>
            </Fact>
          )}
        </dl>
      </div>

      <p className={cn(ui.text.secondary, ui.tone.default)} data-testid="mapping-execute-what">
        {proposal.kind === "map" ? e.whatMap : e.whatOther}
      </p>
      <p className={cn(ui.text.meta, ui.tone.muted)}>{e.fingerprintCheck}</p>

      {/* No <form>: Enter in the field never executes. Only the button does. */}
      <UiInput
        label={e.typeLabel}
        hint={e.typeHint(EXECUTE_CONFIRMATION_PHRASE)}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        disabled={busy}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        dir="ltr"
        data-testid="mapping-execute-input"
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <UiButton
          size="sm"
          variant="gradient"
          className="w-full sm:w-auto"
          disabled={!armed}
          onClick={run}
          data-testid="mapping-execute"
        >
          {busy ? e.running : e.button}
        </UiButton>
      </div>

      {message && (
        <AdminNotice
          tone={message.tone}
          role={message.tone === "alert" ? "alert" : "status"}
          testId="mapping-execute-message"
        >
          {message.text}
        </AdminNotice>
      )}
    </section>
  );
}
