import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  ui,
  UiAlert,
  UiBackButton,
  UiBadge,
  UiCard,
  UiChip,
  UiSkeleton,
} from "@/components/ui-kit";
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
 *     `rose-*` or `amber-*` left. That is what let the console leave its dark
 *     register: it used to put `dark` on its outermost element, and dropping
 *     that one class moved every Admin screen onto BotolaGO's own light look
 *     -- the page, the white cards, the round controls -- with the kit's
 *     contrast decisions intact (`--ui-on-caution` on the amber fill,
 *     `--ui-on-ink` on the brand fill, the one card shadow).
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
 * The shape is Option A's card: the 14px card radius (`--ui-radius-card`),
 * the one card shadow, and no border -- the app draws a card by its shadow
 * on the page, not by a hairline. It sat on the 6px control step, with a
 * rule, while the console was its own dark room; next to BotolaGO's screens
 * that read as a different product.
 */
export const ADMIN_CARD_CLASS = cn(
  "bg-[color:var(--ui-surface)]",
  ui.radius.card,
  "shadow-[var(--ui-shadow-card)]",
);

/**
 * Inner surface, for cards nested inside an already-raised Admin panel.
 *
 * `--ui-surface-sunken` is the kit's recessed step -- tracks, table heads,
 * nested panels: a second level inside a card. Same foreground note as
 * above. It takes the 10px track radius, the step the fields beside it use,
 * so a row inside a 14px card nests rather than competing with it; the
 * hairline it carried is the sunken colour itself in the light theme, so it
 * drew nothing and is gone.
 */
export const ADMIN_PANEL_CLASS = cn("bg-[color:var(--ui-surface-sunken)]", ui.radius.track);

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

/**
 * The way back to a hub from a page under it: the app's own back pill
 * (`UiBackButton`, a soft round control whose arrow `styles.css` mirrors for
 * Arabic). The kit's pill takes no `data-*`, so a browser hook sits on a
 * wrapper that is exactly the pill's size.
 */
export function AdminBackLink({
  to,
  label,
  testId,
}: {
  to: string;
  label: string;
  testId?: string;
}) {
  return (
    <span className="inline-flex" data-testid={testId}>
      <UiBackButton to={to} label={label} />
    </span>
  );
}

export interface AdminFilterChip<T extends string> {
  readonly value: T;
  readonly label: string;
}

/**
 * One labelled row of filter chips -- the app's own filter control (the
 * Matches day filter, the Fantasy sort row): sunken pills at rest, the chosen
 * one white on navy. A filter is one tap rather than open, pick, then submit.
 *
 * On a phone the row scrolls sideways instead of wrapping into a block of
 * pills; the 4px inset is room for the focus ring, which sits 4px outside a
 * chip and would otherwise be cut by the scroll box.
 */
export function AdminFilterChips<T extends string>({
  label,
  options,
  value,
  onSelect,
  "data-testid": testId,
}: {
  label: string;
  options: readonly AdminFilterChip<T>[];
  value: T;
  onSelect: (value: T) => void;
  "data-testid": string;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <p className={ADMIN_LABEL_CLASS} aria-hidden>
        {label}
      </p>
      <div
        role="group"
        aria-label={label}
        className="-m-1 flex gap-2 overflow-x-auto p-1 [scrollbar-width:none] sm:flex-wrap"
        data-testid={testId}
      >
        {options.map((option) => (
          <UiChip
            key={option.value || "all"}
            selected={option.value === value}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </UiChip>
        ))}
      </div>
    </div>
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
 * A date written out in the reader's language -- "24/09/2026 09:30:08",
 * "jeudi 24 septembre 2026 à 13:10 (UTC+1)", or its Arabic equivalent.
 *
 * Deliberately not an <AdminDatum>. A formatted date is text in the reader's
 * language, not LTR data: the Arabic formatter puts right-to-left marks after
 * the day and the month, and forcing `dir="ltr"` on that string reordered it
 * on screen -- measured in the News CMS, "24/9/2026 9:40:00 ص" was drawn as
 * "/9/2026 9:40:00 ص24". So the value is still isolated from the sentence
 * around it, but takes its direction from its own text (`dir="auto"`), and it
 * wraps between words: AdminDatum's `break-all`, right for a UUID, split
 * "(UTC)" into "(UT" and "C)".
 */
export function AdminDate({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="auto" className={cn("break-words", className)}>
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
export function AdminEmptyState({
  children,
  testId,
  className,
}: {
  children: ReactNode;
  testId?: string;
  /** A screen whose list sits on the page rather than in a card passes
   *  `ADMIN_CARD_CLASS`, so the empty state is a card like its rows. */
  className?: string;
}) {
  return (
    <p
      className={cn(
        ADMIN_PANEL_CLASS,
        "px-4 py-6 text-center",
        ui.text.secondary,
        ui.tone.muted,
        className,
      )}
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
export function AdminSkeletonList({
  rows = 3,
  testId,
  surface = "panel",
}: {
  rows?: number;
  testId?: string;
  /**
   * `card`: each placeholder is a white card holding two bars, the way the
   * app draws a loading list on the page. The default `panel` is the plain
   * block, for a list already inside a card.
   */
  surface?: "panel" | "card";
}) {
  return (
    <div className="grid gap-3" aria-hidden data-testid={testId}>
      {Array.from({ length: rows }, (_, index) =>
        surface === "card" ? (
          <div key={index} className={cn(ADMIN_CARD_CLASS, "grid gap-2 p-4")}>
            <UiSkeleton className="h-5 w-2/3" />
            <UiSkeleton className="h-4 w-1/3" />
          </div>
        ) : (
          <UiSkeleton key={index} className="h-20" />
        ),
      )}
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
