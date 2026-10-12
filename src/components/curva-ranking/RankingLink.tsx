import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { useRankingCopy } from "./ranking-copy";

/** The Curva home's way into the ranking: one row, the title, one line, a chevron. */
export function RankingLink() {
  const copy = useRankingCopy();
  return (
    <Link
      to="/curva/classement"
      className={cn("press-tile block", ui.surface.card, ui.focus)}
      data-testid="curva-ranking-link"
    >
      <span className="flex min-h-[var(--ui-row-min)] items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0">
          <span className={cn("block", ui.text.bodyStrong, ui.tone.default)}>{copy.linkTitle}</span>
          <span className={cn("block text-pretty", ui.text.secondary, ui.tone.muted)}>
            {copy.linkBody}
          </span>
        </span>
        <ChevronRight className={cn("h-5 w-5 shrink-0", ui.tone.muted)} aria-hidden />
      </span>
    </Link>
  );
}
