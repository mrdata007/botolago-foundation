import { X } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { ui, UiCard, UiIconButton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

/**
 * The anatomy shared by the heroes and the born panel (plan 5.3): a 44 px row with the label at
 * the inline start and a 44 px × at the end; the card (the stage, kept in place by the page);
 * the lines; the buttons. After acknowledgement the label row, the lines and the buttons collapse
 * (`grid-template-rows` 1fr to 0fr, 260 ms on the app's standard ease) and the card stays, so
 * the stage is the ordinary stage again. Under reduced motion the collapse is instant.
 *
 * Collapsed parts are `inert`: not focusable, not read. A part that opens (a hero decided a
 * moment after the page mounted) opens at once, with no transition: only closing is animated.
 */
export function Collapsible({
  collapsed,
  animate = true,
  children,
  className,
}: {
  collapsed: boolean;
  /** Whether a change of `collapsed` is animated. */
  animate?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid",
        animate &&
          "transition-[grid-template-rows] duration-[260ms] ease-[var(--ease-standard)] motion-reduce:transition-none",
        collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        className,
      )}
      inert={collapsed}
      aria-hidden={collapsed || undefined}
    >
      <div className={cn("min-h-0", collapsed && "overflow-hidden")}>{children}</div>
    </div>
  );
}

export function HeroFrame({
  active,
  acked,
  headingId,
  heading,
  closeLabel,
  onClose,
  lines,
  actions,
  children,
  sectionRef,
  testId,
  kind,
}: {
  /** There is a hero to show. With a stage between, the frame stays in the tree when it is not. */
  active: boolean;
  /** The hero was acknowledged: the label row, the lines and the buttons collapse. */
  acked: boolean;
  headingId: string;
  heading: ReactNode;
  closeLabel: string;
  onClose: () => void;
  lines: ReactNode;
  actions: ReactNode;
  /** The stage, drawn by the page between the label row and the lines. */
  children?: ReactNode;
  sectionRef?: Ref<HTMLElement>;
  testId: string;
  kind: string;
}) {
  const collapsed = !active || acked;
  const top = (
    <div className="flex min-h-[var(--ui-tap-min)] items-center justify-between gap-3">
      <h2 id={headingId} className={cn("min-w-0 text-balance", ui.display.team, ui.tone.default)}>
        {heading}
      </h2>
      <UiIconButton aria-label={closeLabel} onClick={onClose} data-testid={`${testId}-close`}>
        <X className="h-5 w-5" aria-hidden />
      </UiIconButton>
    </div>
  );
  const bottom = (
    <div className="flex flex-col gap-3 pt-3">
      {lines}
      {actions}
    </div>
  );

  if (children !== undefined && children !== null) {
    return (
      <section
        ref={sectionRef}
        aria-labelledby={active ? headingId : undefined}
        data-testid={testId}
        data-hero-kind={active ? kind : undefined}
        data-collapsed={collapsed ? "1" : undefined}
        className="flex flex-col"
      >
        <Collapsible collapsed={collapsed} animate={acked} className={ui.space.gutter}>
          {active ? top : null}
        </Collapsible>
        {children}
        <Collapsible collapsed={collapsed} animate={acked} className={ui.space.gutter}>
          {active ? bottom : null}
        </Collapsible>
      </section>
    );
  }

  if (!active) return null;
  return (
    <div className={ui.space.gutter}>
      <Collapsible collapsed={collapsed} animate={acked}>
        <section
          ref={sectionRef}
          aria-labelledby={headingId}
          data-testid={testId}
          data-hero-kind={kind}
          data-collapsed={collapsed ? "1" : undefined}
        >
          <UiCard padding="md" className="mb-3">
            {top}
            {bottom}
          </UiCard>
        </section>
      </Collapsible>
    </div>
  );
}
