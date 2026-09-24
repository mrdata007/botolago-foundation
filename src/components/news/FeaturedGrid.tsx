import type { ArticleCardDto } from "@/backend/news/contracts";
import type { Club } from "@/types/domain";
import { ArticleCard } from "@/components/common/ArticleCard";
import { PlacementBadge } from "./PlacementBadge";
import { featuredTreatmentForIndex, isBreaking, presentArticleForDisplay } from "./news-data";

/**
 * "Top stories" — an editorially varied rail rather than a uniform grid:
 * the first item runs as a photo card, the next couple as dense rows, and the
 * rest as full rows with their thumbnail. Position (not a hardcoded id) drives
 * the treatment, so it degrades gracefully with however many featured
 * placements `home_modules` actually returns.
 *
 * Option A: the photo card and the rows are `ArticleCard`'s `imageLed`,
 * `compact` and `horizontal`, in the club colours; a `breaking` placement
 * hands the card its "Dernière minute" pill through `flag`.
 */
export function FeaturedGrid({
  featured,
  clubs,
}: {
  featured: readonly ArticleCardDto[];
  clubs: readonly Club[];
}) {
  const hero = featured[0];
  const compactItems = featured.slice(1, 3);
  const restItems = featured.slice(3);

  return (
    <div className="grid gap-2.5">
      {hero && <FeaturedCard dto={hero} clubs={clubs} variant="imageLed" />}
      {compactItems.map((dto) => (
        <FeaturedCard key={dto.id} dto={dto} clubs={clubs} variant="compact" />
      ))}
      {restItems.length > 0 && (
        // Two-up only when there are two: a lone card in a two-column grid
        // left half the row empty on desktop.
        <div className={restItems.length > 1 ? "grid gap-2.5 sm:grid-cols-2" : "grid gap-2.5"}>
          {restItems.map((dto) => (
            <FeaturedCard key={dto.id} dto={dto} clubs={clubs} variant="horizontal" />
          ))}
        </div>
      )}
    </div>
  );
}

function FeaturedCard({
  dto,
  clubs,
  variant,
}: {
  dto: ArticleCardDto;
  clubs: readonly Club[];
  variant: "imageLed" | "compact" | "horizontal";
}) {
  return (
    <ArticleCard
      article={presentArticleForDisplay(dto)}
      variant={variant}
      clubs={clubs}
      flag={isBreaking(dto.placement) ? <PlacementBadge /> : undefined}
    />
  );
}

// featuredTreatmentForIndex documents/tests the same position-based rule this
// component applies inline; re-exported here so it stays exercised by tests
// even though the JSX above expresses it directly for clarity.
export { featuredTreatmentForIndex };
