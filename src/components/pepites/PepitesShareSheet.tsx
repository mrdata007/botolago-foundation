import type { ComponentProps } from "react";

import { ShareImageSheet } from "@/components/common/ShareImageSheet";

/** The shared image sheet, tagged with the Pépites campaign. */
export function PepitesShareSheet(
  props: Omit<ComponentProps<typeof ShareImageSheet>, "campaign" | "testIdPrefix">,
) {
  return <ShareImageSheet {...props} campaign="pepites" testIdPrefix="pepites" />;
}
