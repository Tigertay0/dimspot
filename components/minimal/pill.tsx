import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The page's one button family (brief section 4b): two tiers, the shape changes with the tier
 * (hero = full pill 44px, nav = 6px radius 32px) and primary/secondary invert the fill.
 */
type Tier = "hero" | "nav";
type Variant = "primary" | "secondary";

const TIER: Record<Tier, string> = {
  hero: "h-11 rounded-full px-5 text-base",
  nav: "relative h-8 rounded-[6px] px-3 text-sm after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
};

const VARIANT: Record<Variant, string> = {
  primary: "bg-[var(--m-ink)] text-white hover:bg-[var(--m-ink-hover)]",
  secondary:
    "border border-[var(--m-line)] bg-[var(--m-surface)] text-[var(--m-ink)] shadow-[var(--m-shadow-btn)] hover:bg-[var(--m-surface-2)]",
};

export function Pill({
  href,
  children,
  tier = "hero",
  variant = "primary",
  arrow = false,
  className,
}: {
  href: string;
  /** transitions-dev "Learn more hover" chevron that spreads into an arrow. */
  arrow?: boolean;
  children: React.ReactNode;
  tier?: Tier;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap",
        "transition-[background-color,transform] duration-150 ease-[var(--m-ease)] active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--m-ink)]",
        "touch-manipulation aria-disabled:pointer-events-none aria-disabled:opacity-40",
        TIER[tier],
        VARIANT[variant],
        arrow && "t-learn",
        className,
      )}
    >
      {children}
      {arrow ? (
        <span aria-hidden className="t-learn-chevron">
          <svg width="14" height="16" viewBox="0 0 14 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path className="t-learn-arm t-learn-arm-top" d="M5 4 L10 8" />
            <path className="t-learn-arm t-learn-arm-bot" d="M5 12 L10 8" />
          </svg>
        </span>
      ) : null}
    </Link>
  );
}
