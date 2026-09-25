import {
  reportUnhandledError,
  setOperationalTransport,
  type OperationalEvent,
} from "@/lib/operational-errors";

/**
 * The client error sink: hands operational events (src/lib/operational-errors.ts)
 * to `api.report_client_errors`, where they are counted per hour, kind of
 * error, page and release (audit 2026-09-24, P1-8: nothing recorded a
 * visitor's error before).
 *
 * What leaves the browser is the event as operational-errors already built
 * it -- a code, an area, the page path, the release and a redacted message --
 * minus its timestamp (the database stamps the hour). It is sent with the
 * public API key only, never the visitor's sign-in token, so a report cannot
 * be tied to an account. Each kind of error is sent once per page visit, and
 * at most 20 in all; a failed send is dropped, never retried.
 */

export const CLIENT_ERROR_BATCH = 10;
export const CLIENT_ERROR_VISIT_CAP = 20;
const FLUSH_DELAY_MS = 2_000;

export type ClientErrorReport = Omit<OperationalEvent, "at">;

export interface ClientErrorSinkOptions {
  /** `<supabase url>/rest/v1/rpc/report_client_errors` */
  readonly endpoint: string;
  /** The public (publishable) API key. */
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly schedule?: (run: () => void, delayMs: number) => void;
}

export interface ClientErrorSink {
  readonly transport: (event: OperationalEvent) => void;
  /** Send what is waiting now (the page is being hidden or closed). */
  readonly flush: () => void;
}

export function createClientErrorSink(options: ClientErrorSinkOptions): ClientErrorSink {
  const fetchImpl = options.fetchImpl ?? fetch;
  const schedule = options.schedule ?? ((run, delayMs) => void setTimeout(run, delayMs));
  const seen = new Set<string>();
  const queue: ClientErrorReport[] = [];
  let scheduled = false;

  const send = (batch: ClientErrorReport[]) => {
    try {
      void fetchImpl(options.endpoint, {
        method: "POST",
        // Survives the page being closed right after the error.
        keepalive: true,
        headers: {
          apikey: options.apiKey,
          "Content-Type": "application/json",
          "Content-Profile": "api",
        },
        body: JSON.stringify({ p_events: batch }),
      }).catch(() => {
        // Dropped: an error report must never cause another error.
      });
    } catch {
      // fetch itself unavailable: nothing to do.
    }
  };

  const flush = () => {
    scheduled = false;
    while (queue.length > 0) send(queue.splice(0, CLIENT_ERROR_BATCH));
  };

  const transport = (event: OperationalEvent) => {
    const key = `${event.kind}|${event.area}|${event.code}|${event.route ?? ""}`;
    if (seen.has(key) || seen.size >= CLIENT_ERROR_VISIT_CAP) return;
    seen.add(key);
    queue.push({
      kind: event.kind,
      area: event.area,
      code: event.code,
      detail: event.detail,
      route: event.route,
      release: event.release,
    });
    if (queue.length >= CLIENT_ERROR_BATCH) {
      flush();
    } else if (!scheduled) {
      scheduled = true;
      schedule(flush, FLUSH_DELAY_MS);
    }
  };

  return { transport, flush };
}

/**
 * Errors that say nothing about BotolaGO: a script from another origin (an
 * extension, an injected ad) reports only "Script error.", and the browser's
 * own ResizeObserver notice is not a failure.
 */
export function isNoise(message: string, error: unknown): boolean {
  if (/^ResizeObserver loop/i.test(message)) return true;
  return error == null && /^Script error\.?$/i.test(message.trim());
}

let installed = false;

/**
 * Install the sink and the window listeners, once, in the browser of a
 * production build that talks to Supabase. Development, tests and the
 * built-in sample data send nothing.
 */
export function installClientErrorSink(): void {
  if (installed || typeof window === "undefined") return;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!import.meta.env.PROD || typeof url !== "string" || typeof apiKey !== "string") return;
  if (!/^https?:\/\//.test(url) || apiKey.length === 0) return;
  installed = true;

  const sink = createClientErrorSink({
    endpoint: `${url.replace(/\/+$/, "")}/rest/v1/rpc/report_client_errors`,
    apiKey,
  });
  setOperationalTransport(sink.transport);

  window.addEventListener("error", (event) => {
    if (isNoise(event.message ?? "", event.error)) return;
    reportUnhandledError("window.error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportUnhandledError("window.unhandledrejection", event.reason);
  });
  window.addEventListener("pagehide", sink.flush);
}
