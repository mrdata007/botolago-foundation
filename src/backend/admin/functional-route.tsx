import type { ReactNode } from "react";
import { ui, UiAlert, UiSkeleton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import type { AdminRouteState } from "./route-access";

/**
 * How an Admin screen sits on the page, in BotolaGO's own look (Option A):
 * a light page, white 14px cards, titles in the display face.
 *
 *  - `card` — the security screens (staff, approvals, audit, security): the
 *    title and everything under it inside one white card, the way a list
 *    group sits in the app. Their rows are sunken panels, which read as rows
 *    on a card and as grey boxes on the page, so the card stays.
 *  - `hub` — a section's front page (the article list): a 34px display
 *    title on the page, like "Matches" or "Profile", an optional action at
 *    its inline end, and the content's own cards below it.
 *  - `detail` — a page under a hub (a new or an edited article): a back pill
 *    first, then a 22px display title, then the content's own cards.
 *
 * It used to be a literal slate-900 box with amber for a refusal, the one
 * Admin surface the tokens could not reach. It is on the kit now, so it
 * follows the theme with everything else.
 */
export type AdminRouteLayout = "card" | "hub" | "detail";

export function AdminFunctionalRoute({
  access,
  title,
  description,
  testId,
  children,
  layout = "card",
  actions,
  back,
}: {
  access: AdminRouteState;
  title: string;
  description: string;
  testId: string;
  children: ReactNode;
  layout?: AdminRouteLayout;
  /** `hub` only: the page's primary action, beside the title. */
  actions?: ReactNode;
  /** `detail` only: the way back to the hub, above the title. */
  back?: ReactNode;
}) {
  if (access.state !== "authorized") {
    // The section keeps the alert role; the kit alert inside it is drawn with
    // no live region of its own, so the refusal is announced once.
    return (
      <section className="mt-6" role="alert" data-admin-state={access.state} data-testid={testId}>
        <UiAlert tone="caution" title={title} live={false}>
          {description}
        </UiAlert>
      </section>
    );
  }

  const heading = (
    <>
      <h2
        id={`${testId}-title`}
        className={cn(
          layout === "hub"
            ? ui.display.title
            : layout === "detail"
              ? ui.display.section
              : ui.display.header,
          ui.tone.default,
        )}
      >
        {title}
      </h2>
      <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{description}</p>
    </>
  );

  if (layout === "card") {
    return (
      <section
        className={cn("mt-6 p-4 sm:p-6", ui.surface.card)}
        data-testid={testId}
        aria-labelledby={`${testId}-title`}
      >
        <header>{heading}</header>
        <div className="mt-5">{children}</div>
      </section>
    );
  }

  return (
    <section className="mt-6" data-testid={testId} aria-labelledby={`${testId}-title`}>
      {back ? <div className="mb-4">{back}</div> : null}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:items-center">
        <div className="min-w-0">{heading}</div>
        {actions ? <div className="w-full sm:w-auto">{actions}</div> : null}
      </header>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function AdminFunctionalLoading() {
  return (
    <section
      className={cn("mt-6 grid gap-3 p-5", ui.surface.card)}
      aria-label="Loading"
      data-testid="admin-route-loading"
    >
      <UiSkeleton className="h-7 w-1/2" />
      <UiSkeleton className="h-4 w-3/4" />
      <UiSkeleton className="h-16" />
    </section>
  );
}
