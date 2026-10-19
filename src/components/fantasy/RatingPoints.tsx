import { LoaderCircle } from "lucide-react";

/** A pending rating is a state, not a zero. Partial points remain visible. */
export function RatingPoints({
  points,
  pending,
  awaitingLabel,
  none = "—",
}: {
  points: number | null;
  pending: boolean;
  awaitingLabel: string;
  none?: string;
}) {
  return (
    <span className="inline-flex items-center justify-center gap-1 align-middle">
      {points !== null ? <span>{points}</span> : !pending ? none : null}
      {pending ? (
        <span role="img" aria-label={awaitingLabel} title={awaitingLabel}>
          <LoaderCircle
            aria-hidden="true"
            className="size-3.5 motion-safe:animate-spin motion-reduce:animate-none"
          />
        </span>
      ) : null}
    </span>
  );
}
