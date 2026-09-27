import { useMutation } from "@tanstack/react-query";
import { Flag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/auth/AuthProvider";
import { REPORTABLE_FIELDS, type ReportableField } from "@/backend/pepites/contracts";
import { PepitesError } from "@/backend/pepites/errors";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ui, UiButton, UiSelect, UiSheet, UiTextarea } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { pepitesService } from "@/services/pepites";

const MAX_MESSAGE = 500;

/** A field's name, one literal key each (the i18n gate reads them). */
function fieldLabel(field: ReportableField, t: (key: TranslationKey) => string): string {
  switch (field) {
    case "name":
      return t("pepites.report.field.name");
    case "date_of_birth":
      return t("pepites.report.field.date_of_birth");
    case "nationality":
      return t("pepites.report.field.nationality");
    case "preferred_foot":
      return t("pepites.report.field.preferred_foot");
    case "height_cm":
      return t("pepites.report.field.height_cm");
    case "detailed_position":
      return t("pepites.report.field.detailed_position");
    case "club":
      return t("pepites.report.field.club");
    case "photo":
      return t("pepites.report.field.photo");
    case "stats":
      return t("pepites.report.field.stats");
  }
}

/**
 * "Signaler une erreur" on a player page: a signed-in fan points at a field
 * and says what is wrong. It lands on the data desk (architecture §3.4);
 * nothing on the page changes until staff correct it.
 */
export function ReportIssueButton({ playerId }: { playerId: string }) {
  const { t } = useI18n();
  const { status, requireAuth } = useAuth();
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<ReportableField>("date_of_birth");
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: () => pepitesService.reportDataIssue(playerId, field, message.trim()),
    onSuccess: () => {
      toast.success(t("pepites.report.sent"));
      setOpen(false);
      setMessage("");
    },
    onError: (error) => {
      if (error instanceof PepitesError && error.code === "rate_limited") {
        toast.error(t("pepites.report.rate_limited"));
      } else if (error instanceof PepitesError && error.code === "mfa_required") {
        // The step-up listener says so and opens the challenge.
      } else {
        toast.error(t("pepites.report.failed"));
      }
    },
  });
  const trimmed = message.trim();

  return (
    <>
      <UiButton
        variant="soft"
        size="sm"
        className="self-start"
        data-testid="pepites-report"
        onClick={() => {
          if (status === "authenticated") setOpen(true);
          else requireAuth(() => setOpen(true), { reason: t("pepites.report.sign_in_reason") });
        }}
      >
        <Flag className="h-4 w-4" aria-hidden />
        {t("pepites.report.button")}
      </UiButton>
      <UiSheet
        open={open}
        onOpenChange={setOpen}
        title={t("pepites.report.title")}
        description={t("pepites.report.body")}
      >
        <form
          className="flex flex-col gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed.length >= 3 && !mutation.isPending) mutation.mutate();
          }}
        >
          <UiSelect
            label={t("pepites.report.field_label")}
            value={field}
            onChange={(event) => setField(event.target.value as ReportableField)}
            options={REPORTABLE_FIELDS.map((value) => ({ value, label: fieldLabel(value, t) }))}
          />
          <UiTextarea
            label={t("pepites.report.message_label")}
            hint={t("pepites.report.message_hint")}
            value={message}
            maxLength={MAX_MESSAGE}
            rows={4}
            onChange={(event) => setMessage(event.target.value)}
            data-testid="pepites-report-message"
          />
          <p className={cn(ui.text.micro, ui.tone.muted)}>{t("pepites.report.privacy")}</p>
          <UiButton
            type="submit"
            variant="ink"
            disabled={trimmed.length < 3 || mutation.isPending}
            data-testid="pepites-report-send"
          >
            {t("pepites.report.send")}
          </UiButton>
        </form>
      </UiSheet>
    </>
  );
}
