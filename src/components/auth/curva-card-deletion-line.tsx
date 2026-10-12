import type { MyCardDto } from "@/backend/manager-card/contracts";
import { useCardCopy, useMomentCopy } from "@/components/manager-card/copy";
import { fill, fillText } from "@/components/manager-card/interpolate";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useMyManagerCard } from "@/services/use-manager-card";

/**
 * The deletion request's line about the manager card (plan section 4, « Deleted account »):
 * « Votre carte de manager et son numéro BOT #482913 seront supprimés. Ce numéro ne sera jamais
 * réattribué. » The serial part only when the card has a serial; a card still in formation has
 * none yet and the line says only that the card goes. No card, no line.
 *
 * The route loads this file with `lazy`, from its live branch only: with the switch off the
 * profile page neither mounts nor downloads any of it. The file name starts with `curva-` so its
 * chunk is named like the section's own, which `scripts/qa/manager-card-off-bundle-gate.ts` lets
 * reach the card code.
 */
export function CardDeletionNotice({
  card,
}: {
  card: Pick<MyCardDto, "serial"> | null | undefined;
}) {
  const moments = useMomentCopy();
  const cardCopy = useCardCopy();
  if (!card) return null;
  // the serial is not shown anywhere, so the sentence is the one without it
  const line = moments.state.deletionNoserial;
  return (
    <p
      data-testid="deletion-card-line"
      className={cn(
        "mb-3 px-3 py-2.5 [text-wrap:pretty]",
        ui.radius.control,
        ui.surface.sunken,
        ui.text.secondary,
      )}
    >
      {line}
    </p>
  );
}

/**
 * The line, read from the manager's card. `warm` renders nothing and only starts the read: the
 * profile page mounts one outside the dialog, so the card is already in the cache (and this chunk
 * already loaded) when the dialog opens and the line does not arrive after the text around it.
 */
export function CardDeletionLine({ warm = false }: { warm?: boolean }) {
  const card = useMyManagerCard().data;
  return warm ? null : <CardDeletionNotice card={card} />;
}
