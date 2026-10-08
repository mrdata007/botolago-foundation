import type { JSX } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { UiSkeleton } from "@/components/ui-kit";

/**
 * G2, Votre carte: STUB from WP1 (the foundation), replaced by WP3 with the screen of plan section
 * 4.2. It keeps its signature (`export function GradinsCardPage(): JSX.Element`).
 */
export function GradinsCardPage(): JSX.Element {
  return (
    <FantasyFrame bottomNav>
      <div className="p-4">
        <UiSkeleton className="h-24 w-full" />
      </div>
    </FantasyFrame>
  );
}
