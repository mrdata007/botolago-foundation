import { createFileRoute } from "@tanstack/react-router";

import { LegalDocumentPage } from "@/components/legal/LegalDocumentPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — BotolaGO" },
      {
        name: "description",
        content: "Politique de confidentialité de BotolaGO.",
      },
    ],
  }),
  component: () => <LegalDocumentPage kind="privacy" />,
});
