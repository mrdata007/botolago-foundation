import { Fragment } from "react";
import { Link } from "@tanstack/react-router";

import type { ConsentSegment } from "./consent-segments";

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
  linkClassName = "font-semibold text-[color:var(--brand-primary)] underline underline-offset-2 hover:opacity-80",
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
