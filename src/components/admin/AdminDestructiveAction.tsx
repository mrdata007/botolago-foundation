import { useId, type Dispatch, type ReactNode } from "react";
import {
  canConfirm,
  isArmed,
  isBusy,
  isRunning,
  reasonFor,
  type DestructiveActionEvent,
  type DestructiveActionState,
} from "@/components/admin/destructive-action";
import { ui, UiButton, UiInput } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

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
 * Direction: no physical left/right anywhere, and letter-spacing only under
 * `ltr:` -- which is now a property of the kit's type ramp rather than of a
 * class string written here. The prompt is composed by the caller so LTR data
 * inside it -- a role slug, an operation type -- can be wrapped in
 * <AdminDatum>.
 *
 * Every control is full width below `sm` and clears the 44px tap floor. That
 * floor used to be a literal `min-h-11` on each control; it now comes from
 * `--ui-tap-min` through `UiButton size="sm"` and `UiInput`, which is the same
 * 2.75rem stated once.
 */

/**
 * The confirm step's own surface.
 *
 * Rose-toned so an armed action reads as armed, and that decision stands --
 * only the rose moves onto `--ui-negative`, the token that means exactly this
 * and that inverts correctly across the themes. `w-full` stands too: when this
 * panel replaces a trigger inside a wrapping action strip it has to claim its
 * own line instead of squeezing in beside sibling buttons.
 *
 * The kit has no negative SURFACE token, and `UiAlert tone="negative"` -- the
 * nearest thing that does exist -- cannot be this element: this is a
 * `role="group"` labelled by its own prompt and holding a field and two
 * controls, where `UiAlert` is a message that takes only `status` or `alert`
 * and renders a live region. So the tint is composed here, from declared
 * tokens only, using `UiAlert`'s own recipe: 14% of the accent mixed into
 * `--ui-surface`.
 */
const CONFIRM_PANEL_CLASS = cn(
  "w-full p-4",
  ui.radius.control,
  "border border-[color:var(--ui-negative)]",
  "bg-[color:color-mix(in_oklab,var(--ui-negative)_14%,var(--ui-surface))]",
);

/**
 * The filled danger control: the resting trigger and the confirm commit.
 *
 * `variant="destructive"` is the kit's name for exactly this, and it is what
 * this component must ask for -- `variant="ink"` would paint "Révoquer" and
 * "Approuver" identically, erasing the one difference this component exists to
 * keep.
 *
 * The fill is added at this call site because the kit declares `destructive`
 * on `UiButtonVariant` but `buttonClass` has no branch for it: asking for the
 * variant alone renders a transparent button carrying an inherited
 * foreground, which on the tinted panel above is a commit control you cannot
 * see. That is a gap in the kit, not a licence to invent -- so the fill is the
 * mandated pairing and nothing else. `--ui-negative` inverts across the themes
 * (a mid-tone in light, a light tint in dark), so the foreground has to be the
 * one that follows it, `--ui-on-negative`. Written white-on-negative it
 * measured 2.31:1 in dark.
 */
const DANGER_FILL = cn("bg-[color:var(--ui-negative)]", ui.tone.onNegative);

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

  const armed = isArmed(state, actionKey);
  const running = isRunning(state, actionKey);
  const reason = reasonFor(state, actionKey);
  const confirmable = canConfirm(state, actionKey, minimumReasonLength);
  const danger = tone === "danger";
  // `primary` is consequential but not destructive (restore), so it takes the
  // action gradient -- the same "this is the affirmative control" the emerald
  // fill it replaces was saying.
  const commitVariant = danger ? "destructive" : "gradient";
  const commitClass = cn("w-full sm:w-auto", danger && DANGER_FILL);

  if (!armed) {
    return (
      <UiButton
        size="sm"
        variant={commitVariant}
        className={cn(commitClass, className)}
        // Disabled while any action on this surface is mid-flight, so a second
        // destructive operation cannot be started on top of the first.
        disabled={disabled || isBusy(state)}
        onClick={() => dispatch({ type: "arm", key: actionKey })}
        data-testid={triggerTestId}
        data-admin-action="idle"
      >
        {triggerLabel}
      </UiButton>
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
      className={cn(CONFIRM_PANEL_CLASS, "grid gap-3", className)}
      role="group"
      aria-labelledby={promptId}
      data-testid={testId ? `${testId}-confirm` : undefined}
      data-admin-action={running ? "running" : "armed"}
    >
      <p id={promptId} className={cn(ui.text.secondary, ui.tone.default)}>
        {confirmPrompt}
      </p>

      {/* `UiInput` rather than a hand-wired <label> + <input>: same field, same
          validation, same autofocus, and it owns the label/hint wiring that was
          being spelled out here. Its own `aria-describedby` composition points
          the field at the hint below, which is what the hand-rolled `hintId`
          did -- so the separate <p> and the id that targeted it are gone rather
          than duplicated. The visible label moves from the console's 11px
          micro-label to the kit's field label; nothing it says changes. */}
      <UiInput
        label={rtl ? "السبب (مطلوب)" : "Motif (requis)"}
        hint={
          rtl
            ? "ثمانية أحرف على الأقل. يخصّ هذا السبب هذا الإجراء وحده، ويُسجَّل في التدقيق."
            : "8 caractères minimum. Ce motif ne vaut que pour cette action et est consigné dans l’audit."
        }
        value={reason}
        onChange={(event) =>
          dispatch({ type: "reason", key: actionKey, value: event.target.value })
        }
        minLength={minimumReasonLength}
        maxLength={500}
        disabled={running}
        // The trigger that had focus has just been replaced by this panel;
        // without this, focus falls to <body> and a keyboard or screen-reader
        // operator is left with no idea a confirm step appeared.
        autoFocus
        data-testid={testId ? `${testId}-reason` : undefined}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <UiButton
          size="sm"
          variant={commitVariant}
          className={commitClass}
          disabled={!confirmable}
          onClick={confirm}
          data-testid={testId ? `${testId}-commit` : undefined}
        >
          {running ? (rtl ? "جارٍ التنفيذ…" : "Opération en cours…") : confirmLabel}
        </UiButton>
        <UiButton
          size="sm"
          variant="outline"
          // `size="sm"` already puts this control on `--ui-tap-min`, which is
          // the same 2.75rem/44px the literal below states, and `cn()`
          className="w-full sm:w-auto"
          disabled={running}
          onClick={() => dispatch({ type: "cancel" })}
          data-testid={testId ? `${testId}-abandon` : undefined}
        >
          {/* Not "Annuler"/"إلغاء": on the approvals queue that is the name of a
              destructive action of its own. Backing out must never read like it. */}
          {rtl ? "تراجع" : "Abandonner"}
        </UiButton>
      </div>
    </div>
  );
}
