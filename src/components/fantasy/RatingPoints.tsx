import { Ellipsis } from "lucide-react";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/** A pending rating is a state, not a zero. Partial points remain visible. */
export function RatingPoints({
  points,
  pending,
  awaitingLabel,
  onAwaitingClick,
  notRated = false,
  notRatedLabel,
  notRatedShortLabel = "NR",
  none = "—",
}: {
  points: number | null;
  pending: boolean;
  awaitingLabel: string;
  onAwaitingClick?: () => void;
  notRated?: boolean;
  notRatedLabel?: string;
  notRatedShortLabel?: string;
  none?: string;
}) {
  const content = (
    <>
      {points !== null ? <span>{points}</span> : !pending ? none : null}
      {notRated ? (
        <span
          role="img"
          aria-label={notRatedLabel}
          title={notRatedLabel}
          className="text-[0.65em] font-medium"
        >
          {notRatedShortLabel}
        </span>
      ) : null}
      {pending ? (
        <span role="img" aria-label={awaitingLabel} title={awaitingLabel}>
          <Ellipsis aria-hidden="true" className="size-3.5" />
        </span>
      ) : null}
    </>
  );
  const frame = "inline-flex max-w-full flex-wrap items-center justify-center gap-1 align-middle";
  return pending && onAwaitingClick ? (
    <button
      type="button"
      aria-label={[
        points === null ? null : String(points),
        notRated ? notRatedLabel : null,
        awaitingLabel,
      ]
        .filter(Boolean)
        .join(" · ")}
      aria-haspopup="dialog"
      onClick={onAwaitingClick}
      className={cn(frame, ui.space.tap, ui.radius.tight, ui.focus)}
    >
      {content}
    </button>
  ) : (
    <span className={frame}>{content}</span>
  );
}
