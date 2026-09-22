import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button, on the shared UI kit.
 *
 * This is the shadcn button the generated screens use, restyled onto the
 * product design language: the kit's control radius, type scale, weights,
 * focus ring and colour tokens replace `rounded-md`/`rounded-xl`, the
 * Tailwind type ramp and the `cta-brand` utility. The `default`/`premium`
 * variants now paint the kit's action gradient.
 *
 * Variant and size names, `asChild`, and the exported `buttonVariants` are
 * all unchanged, so `pagination`, `alert-dialog` and `calendar` keep working
 * without edits.
 *
 * No physical direction utilities, and no `tracking-*` at all — Arabic
 * letterforms join and must never be letter-spaced (BG-0069).
 */

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer select-none",
    "rounded-[var(--ui-radius-control)] text-[length:var(--ui-text-body)] [font-weight:var(--ui-weight-body)]",
    "transition-[background-color,color,box-shadow,transform,opacity] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ui-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--ui-page)]",
    "active:translate-y-px active:duration-[var(--duration-tap)]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
    "aria-busy:opacity-80 aria-busy:pointer-events-none",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-[image:var(--ui-grad-action)] text-[color:var(--ui-ink-deep)] [font-weight:var(--ui-weight-heavy)]",
        premium:
          "bg-[image:var(--ui-grad-action)] text-[color:var(--ui-ink-deep)] [font-weight:var(--ui-weight-heavy)]",

        destructive:
          "bg-[color:var(--ui-negative)] text-[color:var(--ui-on-ink-plain)] shadow-[var(--ui-shadow-card)] hover:opacity-90",
        outline:
          "border border-[color:var(--ui-rule)] bg-[color:var(--ui-surface)] text-[color:var(--ui-on-surface)] shadow-[var(--ui-shadow-card)] hover:bg-[color:var(--ui-surface-sunken)]",
        secondary:
          "bg-[color:var(--ui-surface-sunken)] text-[color:var(--ui-on-surface)] shadow-[var(--ui-shadow-card)] hover:opacity-90",
        ghost:
          "bg-transparent text-[color:var(--ui-on-surface)] hover:bg-[color:var(--ui-surface-sunken)]",
        link: "text-[color:var(--ui-ink)] underline-offset-4 hover:underline",
      },
      size: {
        // Every size keeps a ≥44px tap target except the two dense shadcn
        // sizes the generated screens use inside toolbars, which keep their
        // historical heights so existing layouts do not shift.
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[length:var(--ui-text-meta)]",
        lg: "h-10 px-8",
        xl: "min-h-[var(--ui-row-min)] px-5 [font-weight:var(--ui-weight-strong)]",
        icon: "h-9 w-9",
        "icon-lg": "min-h-[var(--ui-tap-min)] min-w-[var(--ui-tap-min)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
