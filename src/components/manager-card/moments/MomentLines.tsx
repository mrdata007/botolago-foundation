import type { JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";

/**
 * The one-line states on Gradins' home (provisional cleared, new season, tier down): STUB from
 * WP1 (the foundation), replaced by WP4. Renders nothing until then. It keeps this signature.
 */
export function MomentLines(props: { card: MyCardDto }): JSX.Element | null {
  void props;
  return null;
}
