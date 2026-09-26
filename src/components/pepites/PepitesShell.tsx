import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/AppShell";
import { UiPageTitle } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";

import { PepitesTabs, type PepitesView } from "./PepitesParts";

/**
 * The frame every Pépites page shares: the title, the three tabs (Top 10,
 * ranking, method) and, on the right, the page's own action (share).
 * The player and week pages pass no tab: they sit under one of the three.
 */
export function PepitesShell({
  view,
  trailing,
  children,
}: {
  view: PepitesView | null;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <AppShell
      backgroundVariant="matches"
      pageHeader={
        <UiPageTitle title={t("pepites.title")} trailing={trailing} className="border-b-0">
          {view ? <PepitesTabs active={view} /> : null}
        </UiPageTitle>
      }
    >
      <div className="flex flex-col gap-4 pt-2" data-testid="pepites-page">
        {children}
      </div>
    </AppShell>
  );
}
