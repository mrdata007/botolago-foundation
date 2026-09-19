import type { ArticleCardDto } from "@/backend/news/contracts";
import type { Club } from "@/types/domain";
import { ArticleCard } from "@/components/common/ArticleCard";
import { PlacementBadge } from "./PlacementBadge";
import { featuredTreatmentForIndex, isBreaking, presentArticleForDisplay } from "./news-data";

/**
 * "Top stories" — an editorially varied rail rather than a uniform grid:
 * the first item runs large with a tall image, the next couple as dense
 * text-led rows, and the rest as smaller side-by-side image cards. Position
 * (not a hardcoded id) drives the treatment, so it degrades gracefully with
 * however many featured placements `home_modules` actually returns.
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
    <div className="grid gap-3">
      {hero && <FeaturedCard dto={hero} clubs={clubs} variant="imageLed" badgeCorner="end" />}
      {compactItems.length > 0 && (
        <div className="grid gap-2">
          {compactItems.map((dto) => (
            <FeaturedCard
              key={dto.id}
              dto={dto}
              clubs={clubs}
              variant="compact"
              badgeCorner="start"
            />
          ))}
        </div>
      )}
      {restItems.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {restItems.map((dto) => (
            <FeaturedCard
              key={dto.id}
              dto={dto}
              clubs={clubs}
              variant="horizontal"
              badgeCorner="start"
            />
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
  badgeCorner,
}: {
  dto: ArticleCardDto;
  clubs: readonly Club[];
  variant: "imageLed" | "compact" | "horizontal";
  badgeCorner: "start" | "end";
}) {
  const article = presentArticleForDisplay(dto);
  return (
    <div className="relative">
      <ArticleCard article={article} variant={variant} clubs={clubs} />
      {isBreaking(dto.placement) && <PlacementBadge corner={badgeCorner} />}
    </div>
  );
}

// featuredTreatmentForIndex documents/tests the same position-based rule this
// component applies inline; re-exported here so it stays exercised by tests
// even though the JSX above expresses it directly for clarity.
export { featuredTreatmentForIndex };
