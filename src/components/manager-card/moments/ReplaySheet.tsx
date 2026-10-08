import type { JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import type { ReplayItem } from "../types";

/**
 * The replay sheet (plan section 4.6): STUB from WP1 (the foundation), replaced by WP4. Renders
 * nothing until then. It keeps this signature.
 */
export function ReplaySheet(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  item: ReplayItem | null;
  current: MyCardDto;
}): JSX.Element {
  void props;
  return <></>;
}
