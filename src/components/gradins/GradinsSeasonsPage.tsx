import type { JSX } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { UiSkeleton } from "@/components/ui-kit";

/**
 * G6, Vos saisons: STUB from WP1 (the foundation), replaced by WP3 with the screen of plan section
 * 4.6. It keeps its signature (`export function GradinsSeasonsPage(): JSX.Element`).
 */
export function GradinsSeasonsPage(): JSX.Element {
  return (
    <FantasyFrame bottomNav>
      <div className="p-4">
        <UiSkeleton className="h-24 w-full" />
      </div>
    </FantasyFrame>
  );
}
