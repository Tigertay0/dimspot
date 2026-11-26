import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Every size sets its own height, and the two small ones add `tap-target` so
 * the hit area still reaches 44px. Nothing here depends on a global rule
 * stretching buttons on touch screens: that is what used to distort them.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold leading-none tracking-[-0.01em] transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Sodium, as on the landing: a light top edge, and a quiet grey when disabled
        // (faded sodium reads as a muddy brown on the night surfaces).
        default:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_20px_-10px_rgba(255,178,26,0.7)] hover:bg-[#ffc24d] disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-transparent text-foreground hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "tap-target h-9 rounded-[10px] px-3.5 text-[13px]",
        lg: "h-12 rounded-2xl px-6 text-[15px]",
        icon: "h-11 w-11",
        "icon-sm": "tap-target h-9 w-9 rounded-[10px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
