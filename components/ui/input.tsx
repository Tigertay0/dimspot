import * as React from "react";
import { cn } from "@/lib/utils";

const field = cn(
  "w-full rounded-xl border border-input bg-card px-4",
  // 16px minimum, otherwise iOS Safari zooms the viewport on focus.
  "text-base",
  "placeholder:text-muted-foreground/80",
  "transition-[border-color,box-shadow] duration-150",
  "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(field, "flex h-12 py-2", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(field, "flex min-h-24 resize-none py-3 leading-snug", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Input, Textarea };
