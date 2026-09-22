import type { ReactNode } from "react";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { FantasyFrame } from "./FantasyFrame";
import { FplHeader } from "./primitives";

/**
 * Frame for BotolaGO-specific Fantasy pages that have no FPL reference
 * screen (player statistics, top players, rankings, rules). They keep their
 * own content but sit under the same Back header and phone-width column as
 * the reconstructed screens so navigation never changes shape.
 */
export function LegacyFantasyPage({
  title,
  backTo = "/fantasy",
  children,
}: {
  title: ReactNode;
  backTo?: string;
  children: ReactNode;
}) {
  return (
    <FantasyFrame>
      <FplHeader title={title} backTo={backTo} />
      <div className={cn("pb-6 pt-3", ui.space.gutter)}>{children}</div>
    </FantasyFrame>
  );
}
