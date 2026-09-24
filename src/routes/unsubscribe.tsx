import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  UnsubscribeView,
  type UnsubscribeViewState,
} from "@/components/notifications/UnsubscribeView";
import { isNotificationEmailUnsubscribeToken } from "@/backend/notifications/contracts";
import { AppShell } from "@/components/shell/AppShell";
import { UiPageTitle } from "@/components/ui-kit";
import { dictionaries } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { unsubscribeFromNotificationEmails } from "@/services/notifications";
import { NOTIFICATION_PREFERENCES_QUERY_KEY } from "@/services/use-notification-preferences";

/**
 * `/unsubscribe?token=…` — the link at the foot of every notification e-mail.
 *
 * Public: the token names the account, so a signed-out reader can turn
 * e-mails off with one confirmed tap and nothing else. The page is kept out of
 * search (noindex here, and it is not in `SITEMAP_STATIC_PATHS`). The token is
 * never logged.
 */
export const Route = createFileRoute("/unsubscribe")({
  head: () => ({
    meta: [
      { title: dictionaries.fr["unsubscribe.meta_title"] },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { token?: string } =>
    typeof search.token === "string" && search.token ? { token: search.token } : {},
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { t } = useI18n();
  const { token = "" } = Route.useSearch();
  return (
    <AppShell pageHeader={<UiPageTitle title={t("unsubscribe.title")} />}>
      {/* A different token is a different question: start over rather than
          carry the last answer across. */}
      <UnsubscribeFlow key={token} token={token} />
    </AppShell>
  );
}

/**
 * Sends nothing until the reader presses the button (see `UnsubscribeView`
 * for why). A link whose token is not even the right shape has nothing to
 * confirm and opens on the invalid screen.
 */
function UnsubscribeFlow({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UnsubscribeViewState>(() =>
    isNotificationEmailUnsubscribeToken(token) ? "confirm" : "invalid",
  );
  // The button is disabled while a request runs, but a double click delivers
  // both clicks before React re-renders; the ref is what stops the second.
  const inFlight = useRef(false);

  const unsubscribe = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState("submitting");
    try {
      const status = await unsubscribeFromNotificationEmails(token);
      setState(status);
      // A signed-in reader's cached switch is now stale.
      if (status !== "invalid")
        void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
    } catch {
      setState("error");
    } finally {
      inFlight.current = false;
    }
  };

  return <UnsubscribeView state={state} onUnsubscribe={() => void unsubscribe()} />;
}
