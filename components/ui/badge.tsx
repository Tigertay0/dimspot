import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * A fixed height and `leading-none`, so a row of badges lines up whatever the
 * text or icon inside, and wraps as whole pills.
 */
const badgeVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-medium leading-none whitespace-nowrap tabular-nums [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        // Severity badges carry colour as a border and tint rather than a solid
        // fill, so a row of them does not read as three competing buttons.
        complete:
          "border-severity-complete/35 bg-severity-complete/10 text-severity-complete",
        degraded:
          "border-severity-degraded/30 bg-severity-degraded/12 text-severity-degraded",
        intermittent:
          "border-severity-intermittent/30 bg-severity-intermittent/12 text-severity-intermittent",
        resolved:
          "border-severity-resolved/30 bg-severity-resolved/12 text-severity-resolved",
      },
      size: {
        default: "",
        sm: "h-5 px-2 text-[11px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  /** A dot in the badge's own colour, for status badges. */
  dot?: boolean;
}

function Badge({ className, variant, size, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      )}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
