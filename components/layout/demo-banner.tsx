"use client";

import { useState } from "react";
import { FlaskConical, X } from "lucide-react";

/**
 * Shown only when the app is running on the local seeded store. Being explicit
 * that the markers are demo data is the difference between a convincing prototype
 * and a misleading one — this map is about real emergencies.
 */
export function DemoBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="glass flex items-center gap-2.5 rounded-[14px] py-2 pr-2 pl-3 text-xs">
      <FlaskConical
        aria-hidden
        className="size-3.5 shrink-0 text-severity-intermittent"
      />
      <p className="min-w-0 flex-1 leading-snug text-muted-foreground">
        <span className="font-semibold text-foreground">Demo data.</span> No
        database connected, so these outages are samples. See SETUP.md.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="tap-target flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
