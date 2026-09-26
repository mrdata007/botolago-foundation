import { createFileRoute } from "@tanstack/react-router";

import { InviteLandingPage } from "@/components/predictions/leagues/InviteLandingPage";
import { fr } from "@/i18n/dictionary-fr";

/**
 * `/pronostics/ligues/rejoindre#code=…`: an invite link's landing page. Never
 * indexed; the code after "#" never reaches the server (invite-link.ts).
 */
export const Route = createFileRoute("/pronostics/ligues/rejoindre")({
  head: () => ({
    meta: [
      { title: fr["predictions.leagues.invite_generic"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InviteLandingPage,
});
