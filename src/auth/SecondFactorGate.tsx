import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { onMfaStepUpRequired } from "@/backend/auth/step-up";
import { useI18n } from "@/i18n/provider";
import { authService, type AuthStatus } from "@/services/auth";
import { secondFactorRedirect } from "./second-factor";
import { createStepUpResponder, showStepUpNotice } from "./step-up-notice";

/**
 * The one-time code as a barrier rather than a page.
 *
 * 1. While the session owes its second factor, any page outside the short list
 *    in `second-factor.ts` sends the reader to the challenge, carrying where
 *    they were as a sanitised `next`. `replace`, so Back does not return to a
 *    page that would only send them forward again.
 * 2. When the database refuses a read or a write for want of the code
 *    (`PT403 mfa_required`, reported by the domain error mappers and by the
 *    query cache), the reader is told so at once, and the session is re-read
 *    with a fresh token -- a factor enrolled on another device is only listed
 *    in a new one. If a code is now owed, (1) takes over. See
 *    `createStepUpResponder`.
 *
 * Staff pages are outside (1) by design: they have their own server-enforced
 * MFA state and screen.
 */
export function SecondFactorGate({ status }: { status: AuthStatus }) {
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });

  useEffect(() => {
    const target = secondFactorRedirect(status, { pathname, searchStr });
    if (target) void navigate({ ...target, replace: true });
  }, [status, pathname, searchStr, navigate]);

  useEffect(
    () =>
      onMfaStepUpRequired(
        createStepUpResponder({
          notify: () => showStepUpNotice(tRef.current),
          getStatus: () => authService.getSession().status,
          recheck: () => authService.recheckSession({ refresh: true }),
        }),
      ),
    [],
  );

  return null;
}
