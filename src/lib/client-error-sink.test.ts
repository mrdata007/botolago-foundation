import { describe, expect, test } from "bun:test";

import {
  CLIENT_ERROR_BATCH,
  CLIENT_ERROR_VISIT_CAP,
  createClientErrorSink,
  isNoise,
} from "./client-error-sink";
import type { OperationalEvent } from "./operational-errors";

function event(code: string, extra: Partial<OperationalEvent> = {}): OperationalEvent {
  return {
    kind: "unhandled",
    area: "window.error",
    code,
    detail: { message: "x is not a function" },
    route: "/fantasy/team",
    release: "8bdfa4074b3eb15511d5b955e64d3fb6cefcdc75",
    at: "2026-09-24T20:00:00.000Z",
    ...extra,
  };
}

function harness() {
  const sent: { url: string; init: RequestInit }[] = [];
  const timers: (() => void)[] = [];
  const sink = createClientErrorSink({
    endpoint: "https://project.supabase.co/rest/v1/rpc/report_client_errors",
    apiKey: "sb_publishable_test",
    fetchImpl: (async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response("{}");
    }) as unknown as typeof fetch,
    schedule: (run) => void timers.push(run),
  });
  const bodies = () =>
    sent.map((call) => JSON.parse(String(call.init.body)).p_events as Record<string, unknown>[]);
  return { sink, sent, timers, bodies };
}

describe("the client error sink", () => {
  test("batches reports and sends them to the RPC with the public key only", () => {
    const { sink, sent, timers, bodies } = harness();
    sink.transport(event("TypeError"));
    sink.transport(event("RangeError"));
    expect(sent).toHaveLength(0);
    expect(timers).toHaveLength(1);
    timers[0]!();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://project.supabase.co/rest/v1/rpc/report_client_errors");
    const headers = sent[0]!.init.headers as Record<string, string>;
    expect(headers).toEqual({
      apikey: "sb_publishable_test",
      "Content-Type": "application/json",
      "Content-Profile": "api",
    });
    // No sign-in token: a report cannot be tied to an account.
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toContain("authorization");
    expect(sent[0]!.init.keepalive).toBe(true);
    expect(bodies()[0]!.map((report) => report.code)).toEqual(["TypeError", "RangeError"]);
  });

  test("sends only what operational-errors built, without the timestamp", () => {
    const { sink, timers, bodies } = harness();
    sink.transport(event("TypeError"));
    timers[0]!();
    expect(Object.keys(bodies()[0]![0]!).sort()).toEqual(
      ["area", "code", "detail", "kind", "release", "route"].sort(),
    );
  });

  test("each kind of error once per visit, and 20 at most", () => {
    const { sink, timers, bodies } = harness();
    for (let i = 0; i < 3; i += 1) sink.transport(event("TypeError"));
    for (let i = 0; i < 40; i += 1) sink.transport(event(`Error${i}`));
    sink.flush();
    for (const run of timers) run();
    const all = bodies().flat();
    expect(all).toHaveLength(CLIENT_ERROR_VISIT_CAP);
    expect(all.filter((report) => report.code === "TypeError")).toHaveLength(1);
    // Never more than the RPC's batch limit in one call.
    expect(Math.max(...bodies().map((batch) => batch.length))).toBeLessThanOrEqual(
      CLIENT_ERROR_BATCH,
    );
  });

  test("the same code on another page is another kind of error", () => {
    const { sink, bodies } = harness();
    sink.transport(event("TypeError"));
    sink.transport(event("TypeError", { route: "/matches" }));
    sink.flush();
    expect(bodies()[0]!.map((report) => report.route)).toEqual(["/fantasy/team", "/matches"]);
  });

  test("a failing network never throws into the page", async () => {
    const sink = createClientErrorSink({
      endpoint: "https://project.supabase.co/rest/v1/rpc/report_client_errors",
      apiKey: "k",
      fetchImpl: (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
      schedule: () => {},
    });
    sink.transport(event("TypeError"));
    expect(() => sink.flush()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("ignores cross-origin script errors and the ResizeObserver notice", () => {
    expect(isNoise("Script error.", null)).toBe(true);
    expect(isNoise("ResizeObserver loop completed with undelivered notifications.", null)).toBe(
      true,
    );
    expect(isNoise("Script error.", new Error("real"))).toBe(false);
    expect(isNoise("x is not a function", null)).toBe(false);
  });

  test("the browser redacts a message exactly as the database does", async () => {
    const { redactText } = await import("./operational-errors");
    // The same input and output as client_error_sink.test.sql's redaction check.
    expect(
      redactText(
        "failed for ali@example.com with eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl at https://botolago.com/x?token=abc",
      ),
    ).toBe("failed for [email] with [jwt] at https://botolago.com/x [redacted]");
  });

  test("the RPC's own limits match the sink's", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const migration = readFileSync(
      join(import.meta.dir, "../../supabase/migrations/20260924200200_ops_health_and_alerts.sql"),
      "utf8",
    );
    expect(migration).toContain(
      `jsonb_array_length(p_events) not between 1 and ${CLIENT_ERROR_BATCH}`,
    );
    expect(migration).toContain(
      "grant execute on function api.report_client_errors(jsonb) to anon, authenticated;",
    );
  });
});
