import { describe, expect, it } from "bun:test";

import { createStructuredLogger, redactLogContext, type LogRecord } from "./logging";

describe("structured logging", () => {
  it("redacts credential-shaped fields recursively", () => {
    expect(
      redactLogContext({
        userId: "user-1",
        accessToken: "access-token-value",
        nested: {
          password: "plain-text",
          locale: "fr",
        },
        rows: [{ service_role_key: "secret-value", count: 2 }],
      }),
    ).toEqual({
      userId: "user-1",
      accessToken: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
        locale: "fr",
      },
      rows: [{ service_role_key: "[REDACTED]", count: 2 }],
    });
  });

  it("emits a deterministic structured record", () => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      sink: (record) => records.push(record),
      now: () => new Date("2026-07-19T12:00:00.000Z"),
      baseContext: { service: "web" },
    });

    logger.info("profile.loaded", { requestId: "req-1" });

    expect(records).toEqual([
      {
        timestamp: "2026-07-19T12:00:00.000Z",
        level: "info",
        event: "profile.loaded",
        context: { service: "web", requestId: "req-1" },
      },
    ]);
  });

  it("inherits redacted context through child loggers", () => {
    const records: LogRecord[] = [];
    const logger = createStructuredLogger({
      sink: (record) => records.push(record),
      now: () => new Date("2026-07-19T12:00:00.000Z"),
    }).child({ requestId: "req-2", refreshToken: "never-log-this" });

    logger.warn("session.expiring");

    expect(records[0]?.context).toEqual({
      requestId: "req-2",
      refreshToken: "[REDACTED]",
    });
  });
});
