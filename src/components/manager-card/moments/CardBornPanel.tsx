import type { JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import type { CardProfile } from "../types";

/**
 * The card-born panel (plan moment M2), above the pitch on `/fantasy/team` or in Gradins' hero
 * slot: STUB from WP1 (the foundation), replaced by WP4. Renders nothing until then. It keeps
 * this signature.
 */
export function CardBornPanel(props: {
  card: MyCardDto;
  profile: CardProfile;
  nextDeadline: string | null;
  surface: "team" | "gradins";
}): JSX.Element | null {
  void props;
  return null;
}
