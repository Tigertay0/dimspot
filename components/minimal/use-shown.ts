"use client";

import { useEffect, useRef, useState } from "react";

/** True once the element is at least `amount` visible; stays true. Drives the CSS reveal classes. */
export function useShown<T extends Element>(amount = 0.4) {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: amount },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [amount]);
  return { ref, shown };
}
