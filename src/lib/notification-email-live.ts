import { createContext, useContext } from "react";

import { NOTIFICATION_EMAIL_LIVE } from "./feature-flags";

/**
 * Whether notification e-mail is really being sent, as the screens see it.
 *
 * The decision is `NOTIFICATION_EMAIL_LIVE` (`src/lib/feature-flags.ts`). It
 * reaches components through this context only so that a test can render a
 * screen in both states — a build-time constant cannot be flipped inside one
 * test run. The app never renders the provider (a source test checks that),
 * so in the product the constant is the answer.
 */
export const NotificationEmailLiveContext = createContext<boolean>(NOTIFICATION_EMAIL_LIVE);

/** `true` once reminders and notification e-mails actually go out. */
export function useNotificationEmailLive(): boolean {
  return useContext(NotificationEmailLiveContext);
}
