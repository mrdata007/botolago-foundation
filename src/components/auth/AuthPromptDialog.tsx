import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { LogIn, UserPlus } from "lucide-react";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export function AuthPromptDialog() {
  const { prompt, closePrompt } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const go = (to: "/auth/login" | "/auth/register") => {
    closePrompt();
    navigate({ to, search: { next: pathname } });
  };

  return (
    <Dialog
      open={prompt.open}
      onOpenChange={(v) => {
        if (!v) {
          prompt.onCancel?.();
          closePrompt();
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("auth.prompt.title")}</DialogTitle>
          <DialogDescription>{prompt.reason ?? t("auth.prompt.body")}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid gap-2">
          <button
            type="button"
            onClick={() => go("/auth/login")}
            className={cn(
              "inline-flex min-h-[var(--ui-row-min)] items-center justify-center gap-2 px-4 text-[color:var(--ui-ink-deep)] hover:opacity-95",
              ui.radius.control,
              ui.text.bodyStrong,
              ui.focus,
            )}
            style={{ backgroundImage: "var(--ui-grad-action)" }}
          >
            <LogIn className="h-4 w-4" aria-hidden />
            {t("auth.prompt.login")}
          </button>
          <button
            type="button"
            onClick={() => go("/auth/register")}
            className={cn(
              "inline-flex min-h-[var(--ui-row-min)] items-center justify-center gap-2 px-4 hover:bg-[color:var(--ui-surface-sunken)]",
              ui.radius.control,
              ui.rule.all,
              ui.text.bodyStrong,
              ui.tone.default,
              ui.focus,
            )}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("auth.prompt.register")}
          </button>
          <button
            type="button"
            onClick={() => {
              prompt.onCancel?.();
              closePrompt();
            }}
            className={cn(
              "mt-1 hover:text-[color:var(--ui-on-surface)]",
              ui.text.meta,
              "[font-weight:var(--ui-weight-strong)]",
              ui.tone.muted,
            )}
          >
            {t("auth.prompt.cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
