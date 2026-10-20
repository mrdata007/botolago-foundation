import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/** A pending rating is a state, not a zero. Partial points remain visible. */
export function RatingPoints({
  points,
  pending,
  awaitingLabel,
  notRated = false,
  notRatedLabel,
  notRatedShortLabel = "NR",
  none = "—",
}: {
  points: number | null;
  pending: boolean;
  awaitingLabel: string;
  notRated?: boolean;
  notRatedLabel?: string;
  notRatedShortLabel?: string;
  none?: string;
}) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1 align-middle">
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
        <span className={cn("min-w-0 whitespace-normal text-center", ui.text.micro)}>
          {awaitingLabel}
        </span>
      ) : null}
    </span>
  );
}
