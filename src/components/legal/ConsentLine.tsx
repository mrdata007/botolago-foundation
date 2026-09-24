import { Fragment } from "react";
import { Link } from "@tanstack/react-router";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { ConsentSegment } from "./consent-segments";

/**
 * The default link treatment: the brand FOREGROUND (`--ui-ink-fg`), heavy and
 * underlined, as the Option A sheets set the two document names. It used to
 * be `--brand-primary`, which is `--ui-ink`: a fill colour used as text, a
 * deep navy in both themes (BG-0083, 1.25:1 on dark). The auth screens were
 * already passing this treatment in; now every caller gets it.
 */
const DEFAULT_LINK_CLASS = cn(
  "[font-weight:var(--ui-weight-heavy)] underline underline-offset-2 hover:opacity-80",
  ui.tone.ink,
);

/**
 * Renders a consent sentence built by `consent-segments.ts`.
 *
 * Segments are emitted in array order and nothing else is inserted between
 * them — every space the sentence needs is inside a segment, chosen by the
 * language that owns it. That is what lets the same component render the
 * French sentence and the Arabic one without a direction-specific branch: the
 * browser's bidi algorithm places the runs, so the links land in the right
 * place under `dir="rtl"` without a single mirrored string.
 *
 * No `tracking-*` here, and no physical-direction utility — this text is
 * Arabic half the time.
 */
export function ConsentLine({
  segments,
  className,
  linkClassName = DEFAULT_LINK_CLASS,
}: {
  segments: readonly ConsentSegment[];
  className?: string;
  linkClassName?: string;
}) {
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.kind === "link" ? (
          <Link key={index} to={segment.to} className={linkClassName}>
            {segment.text}
          </Link>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </span>
  );
}
