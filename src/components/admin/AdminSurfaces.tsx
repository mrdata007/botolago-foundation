import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The single definition of the Admin console's visual language.
 *
 * The console shell (`routes/admin.tsx`) and every security sub-page
 * (`admin.staff`, `admin.staff.$principalId`, `admin.approvals`,
 * `admin.security`, `admin.audit`) import from here, so a card, a micro-label
 * or an icon tile can never drift into a second, slightly different copy.
 *
 * Two rules the whole Admin surface follows, and which these primitives
 * enforce by construction:
 *
 *  1. Direction. Nothing here uses `left`/`right` -- only logical utilities --
 *     so the same markup lays out correctly in Arabic RTL. LTR data (UUIDs,
 *     e-mails, ISO timestamps, role slugs) is wrapped in <AdminDatum>, which
 *     forces direction on the *value only*. The surrounding label keeps the
 *     ambient direction. An Arabic string is never hand-mirrored: that renders
 *     right and reads backwards to a screen reader.
 *  2. Letterforms. Uppercase micro-labels use `tracking-wide`, never
 *     `tracking-wider` -- Arabic letters join and must not be pulled apart.
 */

/** Shared card surface, so every Admin panel reads as one set. */
export const ADMIN_CARD_CLASS =
  "rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg shadow-slate-950/40";

/** Inner surface, for cards nested inside an already-raised Admin panel. */
export const ADMIN_PANEL_CLASS = "rounded-2xl border border-slate-800 bg-slate-950/40";

/** Small uppercase label above a value; `tracking-wide` only, since Arabic
 *  letterforms join and must not be spaced apart. */
export const ADMIN_LABEL_CLASS = "text-[11px] font-semibold uppercase tracking-wide text-slate-400";

/** Emerald badge tile carrying a section icon. */
export function AdminIconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      aria-hidden
    >
      <Icon className="h-5 w-5" />
    </span>
  );
}

/** A titled card on the raised Admin surface: label over value. */
export function AdminSummaryCard({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <article className={`${ADMIN_CARD_CLASS} p-4`} data-testid={testId}>
      <h3 className={ADMIN_LABEL_CLASS}>{title}</h3>
      <div className="mt-2 min-w-0 text-sm text-slate-100">{children}</div>
    </article>
  );
}

/** Label-over-value pair inside a card or a definition list. */
export function AdminField({
  label,
  children,
  className = "",
  testId,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`} data-testid={testId}>
      <dt className={ADMIN_LABEL_CLASS}>{label}</dt>
      <dd className="mt-1 min-w-0 text-sm text-slate-100">{children}</dd>
    </div>
  );
}

/**
 * An LTR datum -- a UUID, an e-mail, an ISO timestamp, a role slug.
 * Only the value is forced, so the label keeps its logical position for a
 * screen reader and the value survives copy/paste.
 */
export function AdminDatum({
  children,
  className = "",
  mono = true,
}: {
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <bdi
      dir="ltr"
      className={`inline-block max-w-full break-all ${mono ? "font-mono" : ""} ${className}`}
    >
      {children}
    </bdi>
  );
}

/** Status pill. `tone` carries meaning through colour and through its text. */
export function AdminBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger";
}) {
  const tones = {
    neutral: "border-slate-700 bg-slate-800/60 text-slate-300",
    positive: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    danger: "border-rose-500/40 bg-rose-500/10 text-rose-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Heading for a block of cards, matching the console home's section labels. */
export function AdminSectionHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className={ADMIN_LABEL_CLASS}>
      {children}
    </h3>
  );
}

/** "Nothing here yet" -- a real surface rather than a stray grey sentence. */
export function AdminEmptyState({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p
      className={`${ADMIN_PANEL_CLASS} px-4 py-6 text-center text-sm text-slate-400`}
      data-testid={testId}
    >
      {children}
    </p>
  );
}

/** Pulsing placeholders, sized like the rows they stand in for. */
export function AdminSkeletonList({ rows = 3, testId }: { rows?: number; testId?: string }) {
  return (
    <div className="grid gap-3" aria-hidden data-testid={testId}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`${ADMIN_PANEL_CLASS} h-20 animate-pulse`} />
      ))}
    </div>
  );
}

/** Operation feedback: an outcome or a refusal, never silently swallowed. */
export function AdminNotice({
  children,
  tone = "info",
  role = "status",
  testId,
}: {
  children: ReactNode;
  tone?: "info" | "alert";
  role?: "status" | "alert";
  testId?: string;
}) {
  const tones = {
    info: "border-slate-700 bg-slate-800/50 text-slate-200",
    alert: "border-amber-600/50 bg-amber-950/40 text-amber-100",
  } as const;
  return (
    <p
      className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${tones[tone]}`}
      role={role}
      data-testid={testId}
    >
      {children}
    </p>
  );
}
