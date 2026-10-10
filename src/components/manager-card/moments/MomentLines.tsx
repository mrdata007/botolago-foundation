import { useEffect, useMemo, useRef, type JSX } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import type { LineSpec } from "../types";
import { LINE_EVENTS, lineText, momentWords } from "./moment-text";
import { useMomentGate } from "./use-moment-gate";

/** The lines Curva' home shows by default; the card page asks for `tier_down` as well. */
const HOME_LINES: readonly LineSpec["kind"][] = ["provisional_cleared", "season_started"];

/**
 * The one-line states of Curva (plan 5.1 and 5.3): « Votre note n'est plus provisoire : 85
 * après 5 journées terminées » once, when the label clears; « Saison 2027/28 : votre carte garde
 * sa note … » while the card shows last season's number; « Palier actuel : STADE. Meilleur cette
 * saison : PRO. » when a fall is stated (the card page asks for that one with `kinds`).
 *
 * Each is a plain sentence, no hero and no motion, placed by the page (G1's « Cette journée »
 * block). A line that carries a moment acknowledges it the moment it is displayed, once the launch
 * gate is open, and counts its view then. The new-season line stays for as long as the card is in
 * that state (it is a state, not just a notice), so the page must not write that sentence itself.
 * Nothing renders when there is nothing to say.
 */
export function MomentLines({
  card,
  kinds = HOME_LINES,
}: {
  card: MyCardDto;
  /** Which lines this place shows; the card page passes `["tier_down"]`. */
  kinds?: readonly LineSpec["kind"][];
}): JSX.Element | null {
  const { t, lang } = useI18n();
  const words = useMemo(() => momentWords(t, lang), [t, lang]);
  const gate = useMomentGate("curva", card);
  const { ready, lines } = gate;
  const shown = useMemo(
    () => (ready ? lines.filter((line) => kinds.includes(line.kind)) : ([] as LineSpec[])),
    [ready, lines, kinds],
  );

  // A line is acknowledged, and counted, once, when it is on screen with the gate open.
  const done = useRef(new Set<string>());
  useEffect(() => {
    if (!gate.ready) return;
    for (const line of shown) {
      const id = `${line.kind}:${line.keys.join(",")}`;
      if (done.current.has(id)) continue;
      if (lineText(line.kind, card, words) === null) continue;
      done.current.add(id);
      const event = LINE_EVENTS[line.kind];
      if (event) track(event);
      if (line.keys.length > 0) gate.ack(line.keys);
    }
  }, [gate, shown, card, words]);

  const rows = shown
    .map((line) => ({ line, text: lineText(line.kind, card, words) }))
    .filter((row) => row.text !== null);
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="moment-lines">
      {rows.map(({ line, text }) => (
        <p key={line.kind} data-line={line.kind} className={cn(ui.text.secondary, ui.tone.default)}>
          {text}
        </p>
      ))}
    </div>
  );
}
