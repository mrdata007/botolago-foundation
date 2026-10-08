import type { JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import type { CardProfile } from "../types";

/**
 * The hero on Gradins' home (plan section 5.3): STUB from WP1 (the foundation), replaced by WP4.
 * Renders nothing until then. It keeps this signature.
 */
export function MomentHero(props: {
  surface: "gradins";
  card: MyCardDto;
  profile: CardProfile;
  onDetail: () => void;
  onShare: () => void;
}): JSX.Element | null {
  void props;
  return null;
}
