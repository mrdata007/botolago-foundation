import { useId, type Dispatch, type ReactNode } from "react";
import {
  adminButtonClass,
  adminDangerButtonClass,
  adminFieldClass,
} from "@/backend/admin/functional-route-helpers";
import { ADMIN_LABEL_CLASS } from "@/components/admin/AdminSurfaces";
import {
  canConfirm,
  isArmed,
  isBusy,
  isRunning,
  reasonFor,
  type DestructiveActionEvent,
  type DestructiveActionState,
} from "@/components/admin/destructive-action";

/**
 * A destructive Admin action that cannot fire on one press.
 *
 * The trigger does not run anything: it arms this action, and the trigger is
 * then *replaced* by a confirm step that names the object and says what will
 * happen to it. The motive is asked for inside that step, so it belongs to the
 * action being confirmed and to nothing else -- see `destructive-action.ts`
 * for why a page-level motive was the whole defect.
 *
 * In-page rather than `window.confirm`: a native dialog cannot be styled, is
 * not translatable, carries no motive field, and cannot be reached by a test.
 *
 * Direction: no physical left/right anywhere, letter-spacing only under `ltr:`
 * (through `ADMIN_LABEL_CLASS`), and the prompt is composed by the caller so
 * LTR data inside it -- a role slug, an operation type -- can be wrapped in
 * <AdminDatum>. Every control is `min-h-11` and full width below `sm`.
 */

/**
 * The confirm step's own surface. Rose-toned so an armed action reads as armed,
 * and `w-full` so that when it replaces a trigger inside a wrapping action
 * strip it claims its own line instead of squeezing in beside sibling buttons.
 */
const CONFIRM_PANEL_CLASS = "w-full rounded-2xl border border-rose-500/40 bg-rose-950/30 p-4";

interface AdminDestructiveActionProps {
  /**
   * Identifies this action uniquely across the whole surface. For a repeated
   * row it must carry the row's own id (`revoke:<assignmentId>`), never just
   * the operation name -- that is what keeps two rows from sharing a motive.
   */
  actionKey: string;
  state: DestructiveActionState;
  dispatch: Dispatch<DestructiveActionEvent>;
  /** The server's motive floor, mirrored only to explain a disabled button. */
  minimumReasonLength: number;
  rtl: boolean;
  /** The resting label, e.g. "Révoquer le rôle". */
  triggerLabel: ReactNode;
  /** Names the object and the consequence: "Révoquer le rôle X ? ...". */
  confirmPrompt: ReactNode;
  /** Names the act being confirmed: "Confirmer la révocation". */
  confirmLabel: ReactNode;
  /** Runs the mutation. Arming, motive and reset are handled here. */
  onConfirm: (reason: string) => void | Promise<void>;
  /** `primary` for a consequential-but-not-destructive action (restore). */
  tone?: "danger" | "primary";
  /** Blocks arming for a reason of the caller's own (never a substitute for authz). */
  disabled?: boolean;
  /** Preserved trigger hook. The confirm step derives its ids from `testId`. */
  triggerTestId?: string;
  /** Base for the confirm step's hooks: `-confirm`, `-reason`, `-commit`, `-abandon`. */
  testId?: string;
  /** Spacing applied to whichever of the two states is on screen. */
  className?: string;
}

export function AdminDestructiveAction({
  actionKey,
  state,
  dispatch,
  minimumReasonLength,
  rtl,
  triggerLabel,
  confirmPrompt,
  confirmLabel,
  onConfirm,
  tone = "danger",
  disabled = false,
  triggerTestId,
  testId,
  className = "",
}: AdminDestructiveActionProps) {
  // Ids are generated per instance: a repeated row must not reuse another
  // row's `aria-labelledby` target.
  const generatedId = useId();
  const promptId = `${generatedId}-prompt`;
  const hintId = `${generatedId}-hint`;

  const armed = isArmed(state, actionKey);
  const running = isRunning(state, actionKey);
  const reason = reasonFor(state, actionKey);
  const confirmable = canConfirm(state, actionKey, minimumReasonLength);
  const triggerClass = tone === "danger" ? adminDangerButtonClass : adminButtonClass;

  if (!armed) {
    return (
      <button
        type="button"
        className={`${triggerClass} w-full sm:w-auto ${className}`}
        // Disabled while any action on this surface is mid-flight, so a second
        // destructive operation cannot be started on top of the first.
        disabled={disabled || isBusy(state)}
        onClick={() => dispatch({ type: "arm", key: actionKey })}
        data-testid={triggerTestId}
        data-admin-action="idle"
      >
        {triggerLabel}
      </button>
    );
  }

  const confirm = () => {
    // Re-checked here and not only through `disabled`: the single source of
    // truth for "may this run" is the state machine, not the DOM.
    if (!confirmable) return;
    dispatch({ type: "start" });
    void Promise.resolve(onConfirm(reason)).finally(() => dispatch({ type: "settle" }));
  };

  return (
    <div
      className={`${CONFIRM_PANEL_CLASS} grid gap-3 ${className}`}
      role="group"
      aria-labelledby={promptId}
      data-testid={testId ? `${testId}-confirm` : undefined}
      data-admin-action={running ? "running" : "armed"}
    >
      <p id={promptId} className="text-sm leading-6 text-rose-100">
        {confirmPrompt}
      </p>

      <label className="grid gap-2 text-sm">
        <span className={ADMIN_LABEL_CLASS}>{rtl ? "السبب (مطلوب)" : "Motif (requis)"}</span>
        <input
          value={reason}
          onChange={(event) =>
            dispatch({ type: "reason", key: actionKey, value: event.target.value })
          }
          minLength={minimumReasonLength}
          maxLength={500}
          disabled={running}
          className={adminFieldClass}
          aria-describedby={hintId}
          // The trigger that had focus has just been replaced by this panel;
          // without this, focus falls to <body> and a keyboard or screen-reader
          // operator is left with no idea a confirm step appeared.
          autoFocus
          data-testid={testId ? `${testId}-reason` : undefined}
        />
      </label>
      <p id={hintId} className="text-xs text-rose-200/80">
        {rtl
          ? "ثمانية أحرف على الأقل. يخصّ هذا السبب هذا الإجراء وحده، ويُسجَّل في التدقيق."
          : "8 caractères minimum. Ce motif ne vaut que pour cette action et est consigné dans l’audit."}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          className={`${triggerClass} w-full sm:w-auto`}
          disabled={!confirmable}
          onClick={confirm}
          data-testid={testId ? `${testId}-commit` : undefined}
        >
          {running ? (rtl ? "جارٍ التنفيذ…" : "Opération en cours…") : confirmLabel}
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-200 outline-none transition-colors hover:border-slate-600 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          disabled={running}
          onClick={() => dispatch({ type: "cancel" })}
          data-testid={testId ? `${testId}-abandon` : undefined}
        >
          {/* Not "Annuler"/"إلغاء": on the approvals queue that is the name of a
              destructive action of its own. Backing out must never read like it. */}
          {rtl ? "تراجع" : "Abandonner"}
        </button>
      </div>
    </div>
  );
}
