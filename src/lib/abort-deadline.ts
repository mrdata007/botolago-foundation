/**
 * A request's signal with a deadline, where the caller's own cancellation is kept.
 *
 * The platform does this with `AbortSignal.any([signal, AbortSignal.timeout(ms)])`, but some
 * embedded browsers and older WebViews have neither function. The first version of this code
 * handed back the caller's signal alone in that case, so the deadline silently disappeared and a
 * hung request stayed a skeleton (audit 2026-10-14, SEC-05). Here the missing pieces are rebuilt
 * from `AbortController` and a timer, feature-detected at each call so both branches can be tested.
 *
 * `release` clears the timer and the listener on the caller's signal; call it when the request
 * fails before a response (a response body is still bounded by the deadline, so it is left to run).
 */
export interface DeadlineSignal {
  /** `undefined` only where there is no `AbortController` at all and the caller gave no signal. */
  readonly signal: AbortSignal | undefined;
  readonly release: () => void;
}

const NOTHING_TO_RELEASE = () => {};

function timeoutReason(): unknown {
  // The same error `AbortSignal.timeout` aborts with, so callers tell a deadline from a cancel.
  if (typeof DOMException === "function") {
    return new DOMException("The operation timed out.", "TimeoutError");
  }
  const error = new Error("The operation timed out.");
  error.name = "TimeoutError";
  return error;
}

export function signalWithDeadline(
  signal: AbortSignal | null | undefined,
  timeoutMs: number,
): DeadlineSignal {
  const caller = signal ?? undefined;
  if (typeof AbortSignal === "undefined") return { signal: caller, release: NOTHING_TO_RELEASE };

  const hasTimeout = typeof AbortSignal.timeout === "function";
  const hasAny = typeof AbortSignal.any === "function";

  // The platform does all of it.
  if (hasTimeout && (!caller || hasAny)) {
    const deadline = AbortSignal.timeout(timeoutMs);
    return {
      signal: caller ? AbortSignal.any([caller, deadline]) : deadline,
      release: NOTHING_TO_RELEASE,
    };
  }

  // Rebuilt by hand. Without `AbortController` nothing can be composed: keep the caller's signal.
  if (typeof AbortController === "undefined") {
    return { signal: caller, release: NOTHING_TO_RELEASE };
  }
  if (caller?.aborted) return { signal: caller, release: NOTHING_TO_RELEASE };

  const controller = new AbortController();
  const timer = setTimeout(() => {
    caller?.removeEventListener("abort", onCallerAbort);
    controller.abort(timeoutReason());
  }, timeoutMs);
  const onCallerAbort = () => {
    clearTimeout(timer);
    controller.abort(caller?.reason);
  };
  const release = () => {
    clearTimeout(timer);
    caller?.removeEventListener("abort", onCallerAbort);
  };
  // A pending deadline must not keep a server process or a test run alive.
  (timer as { unref?: () => void }).unref?.();
  caller?.addEventListener("abort", onCallerAbort, { once: true });
  return { signal: controller.signal, release };
}
