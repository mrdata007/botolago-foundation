import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { LogIn, UserPlus } from "lucide-react";

export function AuthPromptDialog() {
  const { prompt, closePrompt } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const go = (to: "/auth/login" | "/auth/register") => {
    closePrompt();
    navigate({ to });
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
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl bg-[color:var(--brand-primary)] px-4 text-sm font-bold text-white hover:opacity-95"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            {t("auth.prompt.login")}
          </button>
          <button
            type="button"
            onClick={() => go("/auth/register")}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-input bg-background px-4 text-sm font-semibold hover:bg-muted"
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
            className="mt-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("auth.prompt.cancel")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
