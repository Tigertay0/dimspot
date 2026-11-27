import { cn } from "@/lib/utils";

/**
 * Dimspot's mark: a D whose counter is a spot of light.
 *
 * The D is one flat shape in the text colour, so it sits with the ink-on-white
 * app and inverts on a dark ground. The spot is the one place the brand amber
 * appears. public/brand/dimspot-mark.svg is the master file (keep the two in
 * step); scripts/gen-brand-icons.mjs draws every icon from it.
 * The viewBox is cropped to the shape, so the mark fills the height it is given.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="3.9 3 16.85 18" aria-hidden className={cn("h-[22px] w-auto", className)}>
      <path
        fill="currentColor"
        d="M5.4 3h6.35a9 9 0 0 1 0 18H5.4a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 5.4 3z"
      />
      <circle fill="#ffb21a" cx="11.75" cy="12" r="3.4" />
    </svg>
  );
}
