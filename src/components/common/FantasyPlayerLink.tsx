import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * What a line-up or squad row does with a player's name (U1): `link` is the
 * Fantasy player id the row's football player maps to, or `null`.
 */
export type FantasyPlayerLinkOf = (footballPlayerId: string) => string | null;

/**
 * A whole row that opens the player's page (`/fantasy/players/$playerId`), or,
 * for a player with no Fantasy id, the same box as a plain element: the layout
 * does not change, only the tap. The link carries the row's own classes, so the
 * target is the full row (at least `--ui-tap-min` high). `focusable={false}` is
 * for the picture of the pitch, which is hidden from assistive technology: its
 * touch target must not be a hidden tab stop.
 */
export function FantasyPlayerLink({
  playerId,
  className,
  style,
  children,
  focusable = true,
  as: Plain = "div",
}: {
  playerId: string | null;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  focusable?: boolean;
  as?: "div" | "span";
}) {
  if (!playerId)
    return (
      <Plain className={className} style={style}>
        {children}
      </Plain>
    );
  return (
    <Link
      to="/fantasy/players/$playerId"
      params={{ playerId }}
      tabIndex={focusable ? undefined : -1}
      style={style}
      className={cn(className, ui.focus)}
    >
      {children}
    </Link>
  );
}
