import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ui, UiAlert, UiBadge, UiCard, UiSkeleton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The single definition of the Admin console's visual language.
 *
 * The console shell (`routes/admin.tsx`) and every security sub-page
 * (`admin.staff`, `admin.staff.$principalId`, `admin.approvals`,
 * `admin.security`, `admin.audit`) import from here, so a card, a micro-label
 * or an icon tile can never drift into a second, slightly different copy.
 *
 * Three rules the whole Admin surface follows, and which these primitives
 * enforce by construction:
 *
 *  1. Direction. Nothing here uses `left`/`right` -- only logical utilities --
 *     so the same markup lays out correctly in Arabic RTL. LTR data (UUIDs,
 *     e-mails, ISO timestamps, role slugs) is wrapped in <AdminDatum>, which
 *     forces direction on the *value only*. The surrounding label keeps the
 *     ambient direction. An Arabic string is never hand-mirrored: that renders
 *     right and reads backwards to a screen reader.
 *  2. Letterforms. Letter-spacing is applied under `ltr:` only. Arabic
 *     letters join, so pulling them apart (`tracking-wide`) or pushing them
 *     together (`tracking-tight`) both break the script -- the rule is no
 *     letter-spacing on Arabic in either direction, not merely a smaller one.
 *  3. Colour. Every surface, foreground, radius and shadow below is a `--ui-*`
 *     token from `@/components/ui-kit`; there is no `slate-*`, `emerald-*`,
 *     `rose-*` or `amber-*` left. The console still reads dark because the
 *     shell puts `dark` on its outermost element, which is where `styles.css`
 *     redeclares every colour-bearing `--ui-*` token -- custom properties
 *     inherit, so the whole console resolves to the dark values. The console
 *     stays dark by SCOPE, not by hardcoded greys, so it now also follows the
 *     kit's contrast decisions: `--ui-on-caution` on the amber fill rather
 *     than amber-on-amber, `--ui-on-ink` on the brand fill, and the one card
 *     shadow rather than a second scale.
 */

/**
 * Shared card surface, so every Admin panel reads as one set.
 *
 * This is `ui.surface.card` in everything but the foreground, and the
 * foreground is deliberately left off. These three strings are pasted into
 * roughly twenty-seven `className={`${ADMIN_CARD_CLASS} p-4`}` template
 * literals across nine routes, and several of those call sites set their own
 * text colour immediately after. A template literal does not run through
 * `cn()`, so two `text-[color:…]` utilities would both land on the element and
 * the winner would be decided by the order Tailwind happened to emit them in
 * -- which is by value, not by call site (measured: Tailwind emits
 * `.text-[color:var(--ui-on-ink)]` before `.text-[color:var(--ui-on-surface-muted)]`).
 * The string this replaces carried no foreground either; it inherited one from
 * the shell, and it still does.
 *
 * Radius moved 16px -> `--ui-radius-control` (6px). The system has six radius
 * steps and a card sits on `control`; 16px is `--ui-radius-sheet`, which is
 * the bottom sheet and the modal. Shadow moved from `shadow-lg
 * shadow-slate-950/40` to `--ui-shadow-card`, the one card shadow -- there is
 * no second elevation scale.
 */
export const ADMIN_CARD_CLASS = cn(
  "bg-[color:var(--ui-surface)]",
  ui.radius.control,
  ui.rule.all,
  "shadow-[var(--ui-shadow-card)]",
);

/**
 * Inner surface, for cards nested inside an already-raised Admin panel.
 *
 * `--ui-surface-sunken` is the kit's recessed step -- tracks, table heads,
 * nested panels. In the dark theme it resolves LIGHTER than `--ui-surface`,
 * where `bg-slate-950/40` painted darker than the card it sat in. The token
 * names the ROLE rather than the direction, and the role is the one this had:
 * a second level inside a card. Same foreground note as above.
 */
export const ADMIN_PANEL_CLASS = cn(
  "bg-[color:var(--ui-surface-sunken)]",
  ui.radius.control,
  ui.rule.all,
);

/**
 * Small uppercase label above a value.
 *
 * `ui.text.label` is the ramp step that exists for exactly this -- 12px, 800,
 * uppercase, `ltr:tracking-wide`. The literal `text-[11px] font-semibold` it
 * replaces was not a step in the ramp at all: `--ui-text-micro` is 11px but
 * carries neither the case nor the tracking, so the label would have had to
 * re-add both. Letter-spacing stays LTR-only inside the token, for the reason
 * in rule 2 above.
 */
export const ADMIN_LABEL_CLASS = cn(ui.text.label, ui.tone.muted);

/**
 * Badge tile carrying a section icon.
 *
 * It was an emerald tint under an emerald glyph. `emerald-*` is not in the
 * system and there is no accent tint token; what the system does have is the
 * brand fill together with the foreground that fill carries, which is
 * `ui.surface.ink` (`--ui-ink` under `--ui-on-ink`). Picking a foreground by
 * hand here is the BG-0083 mistake -- `--ui-ink` is a dark navy in both
 * themes and measured 1.25:1 as text.
 *
 * The 44px box is `ui.space.tap` rather than `h-11 w-11`: rule 5 wants the
 * height to come from `--ui-tap-min`, and it is the same 2.75rem.
 */
export function AdminIconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center",
        ui.space.tap,
        ui.radius.control,
        ui.surface.ink,
      )}
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
  // `UiCard` rather than `ADMIN_CARD_CLASS` + `p-4`: same surface, and its
  // `testId` prop now carries the `data-testid` the browser specs address
  // these cards by, so the hook survives the conversion without a spare `div`.
  return (
    <UiCard as="article" padding="md" testId={testId}>
      <h3 className={ADMIN_LABEL_CLASS}>{title}</h3>
      <div className={cn("mt-2 min-w-0", ui.text.secondary, ui.tone.default)}>{children}</div>
    </UiCard>
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
      <dd className={cn("mt-1 min-w-0", ui.text.secondary, ui.tone.default)}>{children}</dd>
    </div>
  );
}

/**
 * An LTR datum -- a UUID, an e-mail, an ISO timestamp, a role slug.
 * Only the value is forced, so the label keeps its logical position for a
 * screen reader and the value survives copy/paste.
 *
 * `font-mono` stays, and stays a raw utility. It carries no colour, so it is
 * not a conversion; and the type ramp has no data face -- `ui.text.*` is nine
 * prose steps and `ui.stat.*` is four numeral steps, neither of which is the
 * fixed-width face a UUID or an ISO timestamp is read in.
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

/**
 * Status pill. `tone` carries meaning through colour and through its text.
 *
 * The four Admin tones map onto the kit's badge tones. Only one of them is not
 * a rename: `warning` becomes `caution`, which paints the amber as a FILL and
 * puts `--ui-on-caution` on it. The amber can never be a foreground --
 * `--ui-caution` measured 1.78:1 as text -- which is exactly what
 * `text-amber-200 on bg-amber-500/10` was. And the two neighbouring tones are
 * wrong for the thing it marks: a pending approval on `negative` reads as a
 * failure, on `neutral` as already dealt with.
 */
const ADMIN_BADGE_TONES = {
  neutral: "neutral",
  positive: "positive",
  warning: "caution",
  danger: "negative",
} as const;

export function AdminBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: keyof typeof ADMIN_BADGE_TONES;
}) {
  return <UiBadge tone={ADMIN_BADGE_TONES[tone]}>{children}</UiBadge>;
}

/** Heading for a block of cards, matching the console home's section labels. */
export function AdminSectionHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className={ADMIN_LABEL_CLASS}>
      {children}
    </h3>
  );
}

/**
 * "Nothing here yet" -- a real surface rather than a stray grey sentence.
 *
 * Deliberately NOT `UiEmptyState`, which is the primitive this looks like it
 * should become. That one renders its own `<h2>` -- the `title` it is given,
 * or the kit's own translated empty-state fallback when it is not -- inside a
 * `role="status"` region. (Spelled out rather than quoted as a call, so this
 * note cannot register as a use of that key in the i18n gate's usage index.)
 * Every call site here passes one
 * translated sentence and nothing else, so adopting it would either add a
 * heading carrying copy no translator wrote, or promote the sentence to a
 * heading; and either way it would add a live region to a block that has never
 * announced anything. A design migration does not get to change what a screen
 * says or what it announces, so the paragraph stays and only its colours,
 * radius and type move onto tokens.
 */
export function AdminEmptyState({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p
      className={cn(ADMIN_PANEL_CLASS, "px-4 py-6 text-center", ui.text.secondary, ui.tone.muted)}
      data-testid={testId}
    >
      {children}
    </p>
  );
}

/**
 * Pulsing placeholders, sized like the rows they stand in for.
 *
 * `UiSkeleton` rather than `ADMIN_PANEL_CLASS` + `animate-pulse`: it is the
 * kit's placeholder block, it already sits on `--ui-surface-sunken`, and its
 * `shimmer` sweep is the one the rest of the product uses -- mirrored under
 * `[dir="rtl"]` and dropped under `prefers-reduced-motion`, neither of which
 * `animate-pulse` was doing here. `aria-hidden` stays on the list, so the
 * placeholders are still invisible to a screen reader.
 */
export function AdminSkeletonList({ rows = 3, testId }: { rows?: number; testId?: string }) {
  return (
    <div className="grid gap-3" aria-hidden data-testid={testId}>
      {Array.from({ length: rows }, (_, index) => (
        <UiSkeleton key={index} className="h-20" />
      ))}
    </div>
  );
}

/**
 * Operation feedback: an outcome or a refusal, never silently swallowed.
 *
 * `UiAlert` is the kit's inline message about the screen you are on, which is
 * what this is. Two things are passed through rather than left to the
 * primitive's defaults:
 *
 *  - `role`. `UiAlert` derives it from the tone, so everything that is not
 *    `negative` would announce politely. Three call sites (`admin.audit`,
 *    `admin.news`, `admin.security`) pass `role="alert"` on an amber notice --
 *    "the revocation worker has not run" is urgent whatever colour it is --
 *    and they must keep announcing as alerts.
 *  - the tone itself. `alert` was amber text on an amber tint; it maps to
 *    `caution`, which is the kit's amber and puts `--ui-on-caution` on it.
 *
 * The notice keeps a live region in both tones, exactly as the `role="status"`
 * default did before.
 */
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
  return (
    <UiAlert tone={tone === "alert" ? "caution" : "info"} role={role} testId={testId}>
      {children}
    </UiAlert>
  );
}
