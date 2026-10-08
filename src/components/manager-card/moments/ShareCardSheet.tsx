import type { JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";

/**
 * The share sheet (plan section 4.7, G7): STUB from WP1 (the foundation), replaced by WP4. Renders
 * nothing until then. It keeps this signature.
 */
export function ShareCardSheet(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  card: MyCardDto;
}): JSX.Element {
  void props;
  return <></>;
}
