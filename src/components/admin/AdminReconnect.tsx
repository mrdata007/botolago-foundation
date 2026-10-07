import { useRouterState } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { UiAlert, UiLinkButton } from "@/components/ui-kit";
import { currentDraftPath, markMotiveDraftForResume } from "./motive-draft";

/**
 * "Se reconnecter": sign in again and come straight back to this page.
 *
 * It is a link to the sign-in page that already exists, with `next` set to
 * the page it was pressed on. That page sanitises `next` itself
 * (`authNextSearch`), sends an account with a second factor through the code
 * challenge with the same `next`, and lands here again once both are done --
 * a fresh sign-in, which is what the 15-minute rule asks for. Nothing about
 * the rule or the server's check changes; this only removes the
 * "déconnectez-vous, reconnectez-vous" the owner had to do by hand.
 *
 * Pressing it marks the motive draft of this page for resuming, so the
 * action that was refused opens again with its motive (`motive-draft.ts`).
 */
export function AdminReconnectButton({
  rtl,
  testId = "admin-reconnect",
}: {
  rtl: boolean;
  testId?: string;
}) {
  const here = useRouterState({ select: (router) => router.location.href });
  return (
    <UiLinkButton
      to="/auth/login"
      search={{ next: here }}
      variant="ink"
      size="sm"
      className="w-full sm:w-auto"
      onClick={() => markMotiveDraftForResume(currentDraftPath())}
      data-testid={testId}
    >
      <LogIn className="h-4 w-4" aria-hidden />
      {rtl ? "إعادة تسجيل الدخول" : "Se reconnecter"}
    </UiLinkButton>
  );
}

/**
 * Shown under an action the server refused because the sign-in is older than
 * 15 minutes: what happened, that the motive is kept, and the way through.
 * A kit alert, so it reads as a message about this action rather than as a
 * second confirm step.
 */
export function AdminRecentAuthPrompt({ rtl, testId }: { rtl: boolean; testId?: string }) {
  return (
    <UiAlert tone="caution" className="w-full" testId={testId}>
      <p>
        {rtl
          ? "مضى على تسجيل دخولك أكثر من 15 دقيقة، وهذا الإجراء يتطلب تسجيل دخول أحدث. السبب الذي كتبته محفوظ، وستعود إلى هذه الصفحة بعد تسجيل الدخول."
          : "Votre connexion date de plus de 15 minutes et cette action en demande une plus récente. Votre motif est conservé, et vous reviendrez sur cette page après la connexion."}
      </p>
      <div className="mt-3">
        <AdminReconnectButton rtl={rtl} />
      </div>
    </UiAlert>
  );
}
