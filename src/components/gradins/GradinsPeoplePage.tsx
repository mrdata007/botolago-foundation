import type { JSX } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { UiSkeleton } from "@/components/ui-kit";

/**
 * G3, Les vôtres: STUB from WP1 (the foundation), replaced by WP3 with the screen of plan section
 * 4.3. It keeps its signature (`export function GradinsPeoplePage(): JSX.Element`).
 */
export function GradinsPeoplePage(): JSX.Element {
  return (
    <FantasyFrame bottomNav>
      <div className="p-4">
        <UiSkeleton className="h-24 w-full" />
      </div>
    </FantasyFrame>
  );
}
