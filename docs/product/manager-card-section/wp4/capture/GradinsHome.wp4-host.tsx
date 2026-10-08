/**
 * WP4's capture host. NOT part of the app: `with-host.sh` copies this file over
 * `src/components/gradins/GradinsHome.tsx` for the length of a capture run and restores the real one
 * (WP3's) afterwards, so the moments can be photographed in the slot the plan gives them (section
 * 4.1) before WP3's page is merged. It composes what G1 composes around the moments: the hero slot
 * (MomentHero, CardBornPanel), the stage's rating line, the one-line states, a share and a replay
 * trigger. `?host=team` shows the born panel as `/fantasy/team` hosts it.
 */
import { useNavigate } from "@tanstack/react-router";
import { useState, type JSX } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { ManagerCard } from "@/components/manager-card/ManagerCard";
import { useGradinsCopy } from "@/components/manager-card/copy";
import { CardBornPanel } from "@/components/manager-card/moments/CardBornPanel";
import { MomentHero } from "@/components/manager-card/moments/MomentHero";
import { MomentLines } from "@/components/manager-card/moments/MomentLines";
import { ReplaySheet } from "@/components/manager-card/moments/ReplaySheet";
import { ShareCardSheet } from "@/components/manager-card/moments/ShareCardSheet";
import { deriveReplayItems } from "@/components/manager-card/moments/moments";
import { useMomentGate } from "@/components/manager-card/moments/use-moment-gate";
import { fromMyCard, guestProfile } from "@/components/manager-card/to-profile";
import { ui, UiButton, UiPageTitle } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useMyManagerCard, useMyManagerCardHistory } from "@/services/use-manager-card";

function search(): URLSearchParams {
  return new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
}

export function GradinsHome(): JSX.Element {
  const copy = useGradinsCopy();
  const query = useMyManagerCard();
  const navigate = useNavigate();
  const card = query.data ?? null;
  const params = search();
  const [shareOpen, setShareOpen] = useState(params.get("share") === "1");
  const history = useMyManagerCardHistory(null);
  const rows = history.data?.pages.flatMap((page) => page.items) ?? [];
  const items = card ? deriveReplayItems(card, rows) : [];
  const [replayIndex, setReplayIndex] = useState<number | null>(
    params.get("replay") !== null ? Number(params.get("replay")) : null,
  );
  const gate = useMomentGate("gradins", card);
  const profile = card ? fromMyCard(card) : guestProfile();

  if (!card) {
    return (
      <FantasyFrame bottomNav topBar="always">
        <UiPageTitle title={copy.nav} />
        <div className="flex justify-center px-4 py-6" data-testid="host-loading">
          <ManagerCard profile={profile} width={240} />
        </div>
      </FantasyFrame>
    );
  }

  const deadline = new Date(Date.now() + 38 * 3_600_000).toISOString();
  const host = params.get("host");
  return (
    <FantasyFrame bottomNav topBar="always">
      <UiPageTitle title={copy.nav} />
      <div className="pb-4" data-testid="host-owner">
        <div className="empty:hidden" data-hero-slot="" data-testid="gradins-hero-slot">
          {host === "team" ? null : (
            <>
              <MomentHero
                surface="gradins"
                card={card}
                profile={profile}
                onDetail={() => void navigate({ to: "/gradins/carte" })}
                onShare={() => setShareOpen(true)}
              />
              <CardBornPanel
                surface="gradins"
                card={card}
                profile={profile}
                nextDeadline={deadline}
              />
            </>
          )}
        </div>
        {host === "team" ? (
          <CardBornPanel surface="team" card={card} profile={profile} nextDeadline={deadline} />
        ) : (
          <div
            className={cn(
              "flex flex-col items-center gap-2 px-4 py-2",
              "[[data-hero-slot]:not(:empty)~&_[data-stage-card]]:hidden",
            )}
          >
            <div data-stage-card="">
              <ManagerCard profile={profile} width={240} beat={gate.hero?.beat ?? undefined} sway />
            </div>
            <p className={cn(ui.text.bodyStrong, ui.tone.default)} data-testid="host-rating">
              {card.ovr !== null ? `${card.ovr} OVR · ${card.tier?.toUpperCase()}` : "—"}
            </p>
          </div>
        )}
        <div className={cn("mt-3 flex flex-col gap-3", ui.space.gutter)}>
          <MomentLines card={card} />
          {card.ovr !== null ? (
            <UiButton
              variant="gradient"
              data-testid="host-share"
              onClick={() => setShareOpen(true)}
            >
              Partager
            </UiButton>
          ) : null}
          <div className="flex flex-wrap gap-2" data-testid="host-replays">
            {items.map((item, index) => (
              <UiButton
                key={`${item.kind}${index}`}
                size="sm"
                variant="soft"
                data-testid={`host-replay-${index}`}
                onClick={() => setReplayIndex(index)}
              >
                {item.kind}
              </UiButton>
            ))}
          </div>
        </div>
      </div>
      <ShareCardSheet open={shareOpen} onOpenChange={setShareOpen} card={card} />
      <ReplaySheet
        open={replayIndex !== null}
        onOpenChange={(open) => !open && setReplayIndex(null)}
        item={replayIndex !== null ? (items[replayIndex] ?? null) : null}
        current={card}
      />
    </FantasyFrame>
  );
}
