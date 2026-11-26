import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A round control that floats over the map: locate, zoom, settings, account.
 * 44px, the same glass as the search bar, so the map's chrome is one family.
 */
export const MapButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      "glass relative flex size-11 shrink-0 items-center justify-center rounded-full text-foreground",
      "transition-[background-color,transform] duration-150 hover:bg-accent active:scale-95",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-50",
      "[&_svg]:size-[18px] [&_svg]:shrink-0",
      className,
    )}
    {...props}
  />
));
MapButton.displayName = "MapButton";
