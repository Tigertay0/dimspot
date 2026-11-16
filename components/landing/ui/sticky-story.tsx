"use client";

// Adapted from https://21st.dev/@felipemenezes098/components/scroll-01
// Changes: the sticky media is a React node (the phone) instead of an image;
// text on the left, phone on the right; crossfade on the project curve; Lights
// Out tokens; left-aligned text; the active step's number brightens. Under
// 768px it stacks each step with its own phone, no sticking.

import { motion, useMotionValueEvent, useScroll, useTransform } from "motion/react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface StoryStep {
  title: string;
  body: string;
  media: ReactNode;
}

function Step({ step, index, onPassed }: { step: StoryStep; index: number; onPassed: (i: number, passed: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 20%"] });
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0.7, 1, 1, 0.7]);
  // A step counts once its text reaches the middle of the screen. Reporting a
  // "passed" flag (not an in-window flag) keeps the phone right even when the
  // page jumps, e.g. from a link or a fast scroll.
  const passed = useTransform(scrollYProgress, (v) => v > 0.4);
  useMotionValueEvent(passed, "change", (v) => onPassed(index, v));

  return (
    <motion.article ref={ref} style={{ opacity }} className="max-w-md">
      <p className="text-[14px] font-medium tabular-nums text-horizon">{index + 1}</p>
      <h3 className="mt-3 text-[24px] leading-[1.2] font-semibold tracking-[-0.01em] text-lamp">{step.title}</h3>
      <p className="mt-3 text-[17px] leading-[1.6] text-lamp-soft">{step.body}</p>
    </motion.article>
  );
}

export function StickyStory({ steps, className }: { steps: StoryStep[]; className?: string }) {
  const [active, setActive] = useState(0);
  const passedSteps = useRef<boolean[]>([]);
  const onPassed = useCallback((i: number, isPassed: boolean) => {
    const next = [...passedSteps.current];
    next[i] = isPassed;
    passedSteps.current = Array.from(next, (v) => v ?? false);
    setActive(Math.max(0, passedSteps.current.lastIndexOf(true)));
  }, []);

  return (
    <div className={className}>
      <div className="space-y-16 md:hidden">
        {steps.map((step, i) => (
          <article key={step.title} className="space-y-6">
            <div className="max-w-md">
              <p className="text-[14px] font-medium tabular-nums text-horizon">{i + 1}</p>
              <h3 className="mt-3 text-[22px] leading-[1.2] font-semibold text-lamp">{step.title}</h3>
              <p className="mt-3 text-[16px] leading-[1.6] text-lamp-soft">{step.body}</p>
            </div>
            <div className="mx-auto w-[260px]">{step.media}</div>
          </article>
        ))}
      </div>

      <div className="hidden gap-16 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <div className="space-y-[12vh] py-[10vh]">
          {steps.map((step, i) => (
            <Step key={step.title} step={step} index={i} onPassed={onPassed} />
          ))}
        </div>
        <div className="sticky top-24 h-[calc(100dvh-8rem)]">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              aria-hidden={active !== i}
              className={cn("absolute inset-0 flex items-center", active !== i && "pointer-events-none")}
              initial={false}
              animate={{ opacity: active === i ? 1 : 0, y: active === i ? 0 : 12 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {step.media}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
