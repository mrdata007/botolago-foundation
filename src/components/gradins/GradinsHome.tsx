import type { JSX } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { ManagerCard } from "@/components/manager-card/ManagerCard";
import { useGradinsCopy } from "@/components/manager-card/copy";
import { fromMyCard, guestProfile } from "@/components/manager-card/to-profile";
import { UiPageTitle } from "@/components/ui-kit";
import { useMyManagerCard } from "@/services/use-manager-card";

/**
 * G1, the section home: STUB from WP1 (the foundation), replaced by WP3 with the screen of plan
 * section 4.1. It keeps its signature. Until then it shows the card the fixture or the account
 * has (the guest's base scarf when there is none), so the renderer can be seen through
 * `/gradins` with `?mc=<fixture>`.
 */
export function GradinsHome(): JSX.Element {
  const copy = useGradinsCopy();
  const card = useMyManagerCard();
  const profile = card.data ? fromMyCard(card.data) : guestProfile();
  return (
    <FantasyFrame bottomNav topBar="always">
      <UiPageTitle title={copy.nav} />
      <div className="flex justify-center px-4 py-6">
        <ManagerCard profile={profile} width={240} testId="gradins-stage" />
      </div>
    </FantasyFrame>
  );
}
