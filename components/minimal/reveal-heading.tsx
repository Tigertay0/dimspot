"use client";

import { cn } from "@/lib/utils";
import { useShown } from "./use-shown";

const H2 = "text-[clamp(28px,3.2vw,40px)] leading-[1.1] font-medium tracking-[-0.03em]";

/** Heading + line with transitions-dev "Texts reveal" (device 1). */
export function StaggerHeading({ id, title, line }: { id: string; title: string; line: string }) {
  const { ref, shown } = useShown<HTMLDivElement>();
  return (
    <div ref={ref} className={cn("t-stagger", shown && "is-shown")}>
      <h2 id={id} className={cn(H2, "t-stagger-line")}>
        {title}
      </h2>
      <p className="t-stagger-line t-stagger-line--2 mt-3 max-w-[560px] text-base leading-[1.55] text-[var(--m-ink-2)] md:text-lg">
        {line}
      </p>
    </div>
  );
}

/** Heading with a left-to-right clip wipe (device 2). */
export function WipeHeading({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { ref, shown } = useShown<HTMLHeadingElement>();
  return (
    // Observe the heading, clip the inner span: a fully clipped element never reports itself as visible.
    <h2 ref={ref} id={id} className={cn(H2, className)}>
      <span className={cn("m-wipe inline-block", shown && "is-shown")}>{children}</span>
    </h2>
  );
}

/** Heading whose last word gets an underline that draws once (device 3). */
export function DrawHeading({ id, lead, word }: { id: string; lead: string; word: string }) {
  const { ref, shown } = useShown<HTMLHeadingElement>();
  return (
    <h2 ref={ref} id={id} className={H2}>
      {lead} <span className={cn("m-draw", shown && "is-shown")}>{word}</span>
    </h2>
  );
}
