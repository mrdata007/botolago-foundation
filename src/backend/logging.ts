export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogScalar = string | number | boolean | null;
export type LogValue = LogScalar | readonly LogValue[] | LogContext;
export interface LogContext {
  readonly [key: string]: LogValue;
}

export interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly event: string;
  readonly context: LogContext;
}

export type LogSink = (record: LogRecord) => void;

export interface StructuredLogger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
  child(context: LogContext): StructuredLogger;
}

export interface LoggerOptions {
  readonly sink: LogSink;
  readonly now?: () => Date;
  readonly baseContext?: LogContext;
}

const REDACTED = "[REDACTED]";

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");

  return (
    normalized.includes("password") ||
    normalized.includes("authorization") ||
    normalized.includes("cookie") ||
    normalized.includes("secret") ||
    normalized.includes("servicerolekey") ||
    normalized.includes("privatekey") ||
    normalized.endsWith("token") ||
    normalized.endsWith("apikey") ||
    normalized === "jwt"
  );
}

function redactValue(value: LogValue): LogValue {
  if (Array.isArray(value)) return value.map(redactValue);

  if (value !== null && typeof value === "object") {
    return redactLogContext(value as LogContext);
  }

  return value;
}

/** Removes common credential fields before a record reaches any log sink. */
export function redactLogContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactValue(value),
    ]),
  );
}

export function createStructuredLogger(options: LoggerOptions): StructuredLogger {
  const now = options.now ?? (() => new Date());
  const baseContext = redactLogContext(options.baseContext ?? {});

  const write = (level: LogLevel, event: string, context: LogContext = {}) => {
    options.sink({
      timestamp: now().toISOString(),
      level,
      event,
      context: redactLogContext({ ...baseContext, ...context }),
    });
  };

  return {
    debug: (event, context) => write("debug", event, context),
    info: (event, context) => write("info", event, context),
    warn: (event, context) => write("warn", event, context),
    error: (event, context) => write("error", event, context),
    child: (context) =>
      createStructuredLogger({
        ...options,
        now,
        baseContext: { ...baseContext, ...redactLogContext(context) },
      }),
  };
}
