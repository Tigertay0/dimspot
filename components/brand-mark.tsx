import { cn } from "@/lib/utils";

/**
 * Dimspot's mark: a streetlamp post and its pool of sodium light, which together
 * read as a D. The shapes are the approved logo's own paths; the light was
 * scaled up, shape unchanged, to the full height of the post so the mark stops
 * reading as a P (public/brand/dimspot-mark.svg is the master file; keep the
 * two in step).
 * The post follows currentColor so the mark works on dusk and on night.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="797 565 592 922" aria-hidden className={cn("h-[22px] w-auto", className)}>
      <path
        fill="currentColor"
        d="M 803.928 571.003 L 929.031 571.153 L 928.954 1480.98 L 804.309 1480.79 C 803.026 1387.2 804.165 1290.6 804.094 1196.77 L 803.928 571.003 z"
      />
      <path
        fill="#ffb21a"
        d="M 959.51 571.08 C 1069.73 589.96 1158.22 630.95 1239.23 709.23 C 1327.98 793.97 1379.2 910.64 1381.54 1033.31 C 1383.06 1153.59 1328.66 1263.08 1246.4 1348.07 C 1165.16 1428.73 1070.98 1465.9 959.19 1480.89 L 959.51 571.08 z"
      />
    </svg>
  );
}
