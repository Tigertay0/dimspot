"use client";

import {
  CheckCircle2,
  CloudAlert,
  Loader2,
  Plus,
  RefreshCw,
  TriangleAlert,
  Users,
} from "lucide-react";
import { SERVICE_COVERAGE, SERVICE_META, SEVERITY_META, sourceLabel } from "@/lib/constants";
import { haversineMeters } from "@/lib/geo";
import { locationLabel, outageTitle, pluralize, timeAgo } from "@/lib/format";
import { useFilters } from "@/lib/store/filters";
import type { Advisory, Outage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ServiceBadge, SeverityLabel } from "@/components/map/markers";
import { cn } from "@/lib/utils";

/**
 * The list companion to the map.
 *
 * A map alone answers "where", badly, on a 5-inch screen — the list answers
 * "what is near me, worst first", which is the actual question most visitors
 * arrive with. Collapsed to a summary bar by default so the map keeps the
 * 70-80% of the screen the PRD asks for (section 5.1).
 */
export function NearbyPanel({
  docked = false,
  outages,
  networkAlerts,
  advisories,
  loading,
  failed,
  onRetry,
  center,
  expanded,
  onExpandedChange,
  onSelect,
  onSelectAdvisory,
  onReport,
}: {
  /** A column beside the map (wide screens) rather than a sheet over it. */
  docked?: boolean;
  /** Outages with a place, in the current viewport. */
  outages: Outage[];
  /** Outages of a whole network: listed first, wherever the map is looking. */
  networkAlerts: Outage[];
  advisories: Advisory[];
  loading: boolean;
  /** The outage fetch failed, so this list is not an answer about the world. */
  failed: boolean;
  onRetry: () => void;
  center: { latitude: number; longitude: number } | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelect: (outage: Outage) => void;
  onSelectAdvisory: (advisory: Advisory) => void;
  onReport: () => void;
}) {
  const sorted = center
    ? [...outages].sort(
        (a, b) => haversineMeters(center, a) - haversineMeters(center, b),
      )
    : outages;

  const visible = sorted.slice(0, 50);
  const active = outages.filter((o) => o.status === "active").length;
  const serviceTypes = useFilters((s) => s.serviceTypes);

  /**
   * What the collapsed bar says when there is nothing to report.
   *
   * "No outages in view" alone reads like the app failed to load. Naming the
   * warnings that *are* in view says the opposite — the map is working, and
   * this is what it found.
   */
  // Named when one type is filtered to, so "nothing here" cannot be mistaken
  // for "the app found nothing at all".
  const lone = serviceTypes.length === 1 ? serviceTypes[0] : null;
  const kind = lone ? `${SERVICE_META[lone].shortLabel.toLowerCase()} ` : "";

  // A failed fetch says nothing about what is in view, so it never borrows the
  // "no outages" wording — or the reassuring tick next to it.
  const summary = failed
    ? outages.length > 0
      ? // A refetch failed over data that did load, so the list is real but
        // stale. Saying it could not load would be wrong in the other direction.
        "Outages may be out of date"
      : "Could not load outages"
    : active > 0
      ? `${active.toLocaleString()} ${kind}outage${active === 1 ? "" : "s"} in view`
      : `No ${kind}outages in view`;

  // A carrier failing everywhere is not "in view", so it is not in that count.
  // With nothing else to show, it is the summary.
  const headline =
    !failed && active === 0 && networkAlerts.length > 0
      ? `${networkAlerts.length} network alert${networkAlerts.length === 1 ? "" : "s"}`
      : summary;

  const rows = (
    <>
      {networkAlerts.length > 0 && <SectionLabel>Network-wide</SectionLabel>}
      {networkAlerts.map((alert) => (
        <li key={alert.id}>
          <Row
            outage={alert}
            title={alert.providerName ?? "A US network"}
            detail={`Whole network · ${sourceLabel(alert.sourceName, "short")}`}
            figure={timeAgo(alert.reportedAt)}
            quietFigure
            onSelect={onSelect}
          />
        </li>
      ))}

      {networkAlerts.length > 0 && visible.length > 0 && <SectionLabel>In this area</SectionLabel>}

      {visible.length === 0 && (networkAlerts.length === 0 || failed) && (
        <li>
          {failed ? (
            <FailedState onRetry={onRetry} loading={loading} />
          ) : (
            <EmptyState
              advisories={advisories}
              onSelectAdvisory={onSelectAdvisory}
              onReport={onReport}
            />
          )}
        </li>
      )}

      {visible.map((outage) => (
        <li key={outage.id}>
          <Row
            outage={outage}
            title={outageTitle(outage)}
            detail={locationLabel(outage)}
            severity
            figure={
              outage.customersAffected !== null
                ? `${outage.customersAffected.toLocaleString()} out`
                : outage.origin === "crowdsourced"
                  ? `${Math.max(1, outage.verificationCount)} ${pluralize(Math.max(1, outage.verificationCount), "neighbor")}`
                  : timeAgo(outage.reportedAt)
            }
            quietFigure={outage.customersAffected === null}
            onSelect={onSelect}
          />
        </li>
      ))}
    </>
  );

  // Beside the map on a wide screen: a plain column, always open.
  if (docked) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <h2 className="flex h-14 shrink-0 items-center gap-2 border-b px-5 text-[15px] font-semibold tracking-[-0.01em]">
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {failed && !loading && <TriangleAlert className="size-4 text-muted-foreground" />}
          {headline}
        </h2>
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1">{rows}</ul>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-auto overflow-hidden rounded-t-3xl bg-card pb-safe dark:border dark:border-b-0 dark:border-border",
        "shadow-[var(--shadow-sheet)] transition-[max-height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        expanded
          ? "max-h-[62dvh]"
          : "max-h-[calc(4rem+env(safe-area-inset-bottom,0px))]",
      )}
    >
      {/* The whole bar is the handle: tap it to open the list. */}
      <button
        type="button"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        className="flex h-16 w-full flex-col items-center px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span aria-hidden className="mt-2.5 h-1 w-9 shrink-0 rounded-full bg-input" />
        <span className="flex flex-1 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {failed && !loading && <TriangleAlert className="size-4 text-muted-foreground" />}
          {headline}
        </span>
      </button>

      {expanded && (
        <ul className="max-h-[calc(62dvh-4rem)] overflow-y-auto overscroll-contain border-t px-2 py-1">
          {rows}
        </ul>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-3 pb-1 pt-3 text-[13px] font-medium text-muted-foreground">{children}</li>
  );
}

/** One outage: who, how bad and where on the left, the figure on the right. */
function Row({
  outage,
  title,
  detail,
  severity = false,
  figure,
  quietFigure = false,
  onSelect,
}: {
  outage: Outage;
  title: string;
  detail: string;
  /** Lead the second line with the severity. Not for a network-wide signal. */
  severity?: boolean;
  figure: string;
  /** A time rather than a count: drawn as secondary text. */
  quietFigure?: boolean;
  onSelect: (outage: Outage) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(outage)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
    >
      <ServiceBadge type={outage.serviceType} report={outage.origin === "crowdsourced"} />

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-3">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{title}</span>
          <span
            className={cn(
              "shrink-0 text-sm tabular-nums",
              quietFigure ? "text-muted-foreground" : "font-semibold",
            )}
          >
            {figure}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          {severity &&
            (outage.origin === "crowdsourced" ? (
              // A neighbor's report says so before anything else.
              <>
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--report-ink)]">
                  <Users aria-hidden className="size-3.5" />
                  Neighbors
                </span>
                <span aria-hidden>·</span>
              </>
            ) : (
              <>
                <SeverityLabel
                  severity={outage.severity}
                  resolved={outage.status === "resolved"}
                  short
                  className="shrink-0"
                />
                <span aria-hidden>·</span>
              </>
            ))}
          <span className="truncate">{detail}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * What the list shows when the fetch failed.
 *
 * Deliberately not the empty state. "Either everything is working, or nobody
 * has reported it yet" is a claim about the world; when the request failed, the
 * app knows nothing about the world and has to say so, or someone checking
 * whether their power is out gets told everything is fine.
 */
function FailedState({
  onRetry,
  loading,
}: {
  onRetry: () => void;
  loading: boolean;
}) {
  return (
    <div className="px-4 py-6">
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden
          className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-foreground"
        >
          <TriangleAlert className="h-5 w-5" />
        </span>

        <p className="text-sm font-medium">Could not load outages</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          This is a connection problem, not an all-clear. Check your connection
          and try again.
        </p>

        <Button variant="secondary" onClick={onRetry} disabled={loading} className="mt-4">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Try again
        </Button>
      </div>
    </div>
  );
}

/**
 * What the list shows when nothing is in view.
 *
 * This is the state a new visitor is most likely to land in, and the one most
 * likely to lose them: PRD section 9 names the chicken-and-egg problem as the
 * top product risk. A bare "nothing here" reads as a broken app, so this screen
 * has three jobs, in order:
 *
 *   1. Say that no outages is a *result*, not a failure.
 *   2. Show whatever else the map does know — weather warnings are usually the
 *      only thing on a calm day, and they explain outages that follow.
 *   3. Offer the one action that fixes an empty map: reporting.
 */
function EmptyState({
  advisories,
  onSelectAdvisory,
  onReport,
}: {
  advisories: Advisory[];
  onSelectAdvisory: (advisory: Advisory) => void;
  onReport: () => void;
}) {
  const resolvedHours = useFilters((s) => s.resolvedHours);
  const setResolvedHours = useFilters((s) => s.setResolvedHours);
  const serviceTypes = useFilters((s) => s.serviceTypes);
  const lone = serviceTypes.length === 1 ? serviceTypes[0] : null;

  return (
    <div className="px-4 py-6">
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden
          className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-foreground"
        >
          <CheckCircle2 className="h-5 w-5" />
        </span>

        <p className="text-sm font-medium">
          {lone
            ? `No ${SERVICE_META[lone].shortLabel.toLowerCase()} outages here`
            : "No outages reported here"}
        </p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          {lone
            ? // What this layer can see matters more than reassurance: for
              // cellular, "everything is working" would be a guess dressed up
              // as a finding.
              SERVICE_COVERAGE[lone].note
            : advisories.length > 0
              ? "Nobody has reported losing service, but conditions below make it more likely."
              : "Either everything is working, or nobody has reported it yet."}
        </p>

        <Button onClick={onReport} className="mt-4">
          <Plus className="h-4 w-4" />
          Report an outage
        </Button>

        {resolvedHours === 0 && (
          <button
            type="button"
            onClick={() => setResolvedHours(6)}
            className="tap-target mt-3 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Show outages resolved in the last 6 hours
          </button>
        )}
      </div>

      {advisories.length > 0 && (
        <div className="mt-6 border-t pt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
            <CloudAlert className="h-3.5 w-3.5" />
            Weather in this area
          </h3>

          <ul className="-mx-2 space-y-0.5">
            {advisories.slice(0, 5).map((advisory) => (
              <li key={advisory.id}>
                <button
                  type="button"
                  onClick={() => onSelectAdvisory(advisory)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                >
                  <span
                    aria-hidden
                    style={{
                      backgroundColor: SEVERITY_META[advisory.severity].token,
                    }}
                    className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {advisory.kind}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {advisory.areaDescription ?? "Nearby"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {advisories.length > 5 && (
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              and {advisories.length - 5} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
