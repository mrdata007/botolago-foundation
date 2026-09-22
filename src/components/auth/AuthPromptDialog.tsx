import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { LogIn, UserPlus } from "lucide-react";
import { UiButton, UiModal } from "@/components/ui-kit";

/**
 * The sign-in prompt that opens over whatever page the reader was already on.
 *
 * It was the last screen in the auth surface still on the V1 shadcn dialog: a
 * literal `bg-black/45` scrim, `--background-elevated` / `--radius-dialog` /
 * `--shadow-dialog`, and a hardcoded English "Close" — the exact string the
 * kit's contract test exists to prevent. Its three buttons hand-rolled what
 * `UiButton` renders, and the cancel one cleared no tap floor at all.
 *
 * Two visible changes, neither accidental. The register button's label moves
 * from `--ui-on-surface` to `--ui-ink-fg` and its border from `--ui-rule` to
 * `currentColor`, because that is what `variant="outline"` is. And the title
 * and description are start-aligned rather than centred, because the shadcn
 * header was `text-center sm:text-start` and the kit's is not — on a phone
 * that is the difference a reviewer will notice first.
 */
export function AuthPromptDialog() {
  const { prompt, closePrompt } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // `next` is the return-to target after signing in. Close first, then
  // navigate, and keep the order: the prompt is rendered above the router.
  const go = (to: "/auth/login" | "/auth/register") => {
    closePrompt();
    navigate({ to, search: { next: pathname } });
  };

  const cancel = () => {
    prompt.onCancel?.();
    closePrompt();
  };

  return (
    <UiModal
      open={prompt.open}
      // The modal's own close control routes through this same handler, so
      // `onCancel` still fires when the reader dismisses rather than chooses.
      // Do not add a second close path.
      onOpenChange={(open) => {
        if (!open) cancel();
      }}
      title={t("auth.prompt.title")}
      description={prompt.reason ?? t("auth.prompt.body")}
      footer={
        <>
          <UiButton variant="gradient" onClick={() => go("/auth/login")}>
            <LogIn className="h-4 w-4" aria-hidden />
            {t("auth.prompt.login")}
          </UiButton>
          <UiButton variant="outline" onClick={() => go("/auth/register")}>
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("auth.prompt.register")}
          </UiButton>
          <UiButton variant="ghost" size="sm" onClick={cancel}>
            {t("auth.prompt.cancel")}
          </UiButton>
        </>
      }
    />
  );
}
