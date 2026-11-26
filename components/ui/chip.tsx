import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A toggle pill: the service-type row over the map, provider and severity
 * filters, alert radius. One component so they all share a height, a radius
 * and a selected state instead of each sheet styling its own.
 *
 * `solid` selects by filling with the text colour (used over the map, where a
 * tint would vanish). `tint` selects with a sodium outline and wash (used in
 * sheets, where the primary button below must stay the only solid sodium).
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
        size === "md" ? "h-9 px-3.5 text-[13px]" : "h-8 px-3 text-xs",
        active
          ? tone === "solid"
            ? "border-transparent bg-foreground text-background shadow-[var(--shadow-float)]"
            : "border-primary/70 bg-primary/14 text-foreground"
          : floating
            ? "glass text-muted-foreground hover:text-foreground"
            : "border-input bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Chip.displayName = "Chip";

export { Chip };
