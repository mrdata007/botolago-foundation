import { useEffect, useState } from "react";

import { PrizeWelcome } from "@/components/prizes/PrizeWelcome";

import { heroShownThisSession } from "../storage";

/**
 * The hub's prize welcome, while the section is live (plan 5.3): it waits for a session in which
 * no hero or born panel has been shown yet. One arrival moment per session, and the card's comes
 * first: a manager who has just met their card on the team page, in this same session, is not
 * also handed a prize dialog on the hub; the next session shows it (the device flag is only set
 * when the dialog is closed, so nothing is lost).
 *
 * Decided after mount, from the session flag, so the server's markup (which has no dialog open
 * either way) is unchanged. Not live, the hub renders `PrizeWelcome` itself and never loads this.
 */
export function PrizeWelcomeGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(!heroShownThisSession());
  }, []);
  return open ? <PrizeWelcome /> : null;
}
