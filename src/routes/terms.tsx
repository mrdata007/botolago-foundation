import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Conditions d'utilisation — BotolaGO" },
      {
        name: "description",
        content: "Conditions d'utilisation de BotolaGO.",
      },
    ],
  }),
  component: () => <LegalDocumentPage kind="terms" />,
});
