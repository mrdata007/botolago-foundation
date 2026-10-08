import { useMemo } from "react";

import { UiSkeleton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

import { cardLabel, useCardStrings } from "./copy";
import { cachedRender } from "./render-cache";
import { useCardRenderer, useCardTheme } from "./use-card-renderer";
import type { CardProfile, TokenSize } from "./types";

/**
 * A card at 24 to 80 px (plan section 6.5): the mini of a table cell (up to 32 px) or the token of
 * a block (44 px and up). Never animated. Client-only like `ManagerCard`: the server and the first
 * client render draw a box of the token's size with a skeleton and the card's label, then the
 * renderer's markup replaces it. The box is `size` square until the renderer says otherwise.
 */
export function CardToken({
  profile,
  size,
  className,
}: {
  profile: CardProfile;
  size: TokenSize;
  className?: string;
}) {
  const strings = useCardStrings();
  const renderer = useCardRenderer();
  const theme = useCardTheme();

  const view = useMemo(() => {
    if (!renderer) return null;
    const key = [renderer.id, "token", strings.lang, theme, size, JSON.stringify(profile)].join(
      "|",
    );
    return {
      html: cachedRender(key, () => renderer.token(profile, { strings, theme, size })),
      box: renderer.tokenBox(profile, size),
    };
  }, [renderer, strings, theme, size, profile]);

  const box = view?.box ?? { width: size, height: size };
  return (
    <span
      className={cn("mc-token inline-block shrink-0 align-middle", className)}
      style={{ width: box.width, height: box.height }}
      data-mc-ready={view ? "1" : undefined}
    >
      {view ? (
        <span className="block" dangerouslySetInnerHTML={{ __html: view.html }} />
      ) : (
        <>
          <UiSkeleton className="h-full w-full" />
          <span className="sr-only">{cardLabel(profile, strings)}</span>
        </>
      )}
    </span>
  );
}
