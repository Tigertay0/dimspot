import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A small toggle: the service-type row over the map, provider and severity
 * filters, alert radius. One component so they share a height, a radius and a
 * selected state instead of each sheet styling its own.
 *
 * `solid` selects by filling with ink (over the map, where it has to read at a
 * glance). `tint` selects with a 2px ink outline on a quiet fill (in sheets,
 * where several can be on at once next to an ink primary button).
 */
export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  tone?: "solid" | "tint";
  size?: "sm" | "md";
  /** Drawn over the map rather than on a sheet. */
  floating?: boolean;
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  (
    { className, active = false, tone = "tint", size = "md", floating = false, type = "button", ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cn(
        "tap-target inline-flex shrink-0 select-none items-center justify-center gap-1.5 rounded-full border font-medium leading-none whitespace-nowrap",
        "transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        size === "md" ? "h-9 px-4 text-sm" : "h-8 px-3 text-[13px]",
        active
          ? tone === "solid"
            ? "border-foreground bg-foreground text-background"
            : "border-foreground bg-secondary text-foreground shadow-[inset_0_0_0_1px_var(--foreground)]"
          : floating
            ? "panel text-muted-foreground hover:text-foreground"
            : "border-input bg-card text-foreground hover:border-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = "Chip";

export { Chip };
