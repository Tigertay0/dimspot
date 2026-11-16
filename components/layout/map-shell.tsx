"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Settings2 } from "lucide-react";
import { DEFAULT_VIEW } from "@/lib/constants";
import { useAdvisories, useOutages, useSession } from "@/lib/hooks/use-outages";
import { activeFilterCount, useFilters } from "@/lib/store/filters";
import type { Advisory, BoundingBox, GeocodeResult, Outage } from "@/lib/types";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { TypeChips } from "@/components/filters/type-chips";
import { MapLegend } from "@/components/map/markers";
import { OutageMap, type MapView } from "@/components/map/outage-map";
import { NearbyPanel } from "@/components/layout/nearby-panel";
import { AdvisorySheet } from "@/components/outage/advisory-sheet";
import { OutageDetailSheet } from "@/components/outage/outage-detail-sheet";
import { ReportSheet } from "@/components/report/report-sheet";
import { SearchBar } from "@/components/search/search-bar";
import { AccountButton, AuthSheet } from "@/components/auth/auth-sheet";
import { DemoBanner } from "./demo-banner";
import { SettingsSheet } from "./settings-sheet";
import { useAppearance } from "@/lib/hooks/use-appearance";
import { useHydrated } from "@/lib/hooks/use-hydrated";

/**
 * The application shell.
 *
 * Owns the pieces of state that more than one child needs — viewport, current
 * selection, which sheet is open — and nothing else. Data fetching lives in the
 * hooks; each sheet manages its own form state.
 */
export function MapShell() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bounds, setBounds] = useState<BoundingBox | null>(null);
  const [center, setCenter] = useState({
    latitude: DEFAULT_VIEW.latitude,
    longitude: DEFAULT_VIEW.longitude,
  });
  const [zoom, setZoom] = useState(DEFAULT_VIEW.zoom);
  const [flyTo, setFlyTo] = useState<MapView | null>(null);

  // Deep links are read once, when state is created, rather than in an effect:
  // /map?outage=<id> comes from a push notification, /map?action=report from the
  // manifest's app shortcut. Doing this in an effect would render the closed
  // state first and then immediately re-render with the sheet open.
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("outage"),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("action") === "report",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  // /?auth=reset&token=… is where a password reset email's link lands.
  const [resetToken, setResetToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("auth") === "reset" && !params.get("error")
      ? params.get("token")
      : null;
  });
  const [authOpen, setAuthOpen] = useState(() => resetToken !== null);
  const [selectedAdvisory, setSelectedAdvisory] = useState<Advisory | null>(null);
  const [picking, setPicking] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);
  /**
   * Resolved before the map mounts, not in an effect.
   *
   * Deciding the theme afterwards meant the map was created with the light
   * style and immediately handed a dark one. A style swap that lands before
   * MapLibre's `load` event supersedes it, so `onLoad` never fired, the
   * viewport was never reported, and the app fetched nothing until the user
   * panned. Picking the right style up front removes the swap entirely.
   */
  const { theme } = useAppearance();

  const { data: session } = useSession();
  const {
    data: outages = [],
    isFetching,
    // A failed fetch must not reach the list as an empty one: "no outages
    // reported nearby" is the one answer this app must never guess at.
    isError: outagesFailed,
    refetch: refetchOutages,
  } = useOutages(bounds);
  const showAdvisories = useFilters((s) => s.showAdvisories);
  const { data: advisories = [] } = useAdvisories(bounds, showAdvisories);

  // Selected field by field. A selector returning a new object every call has
  // no stable identity, which makes useSyncExternalStore re-render forever.
  const selectedServiceTypes = useFilters((s) => s.serviceTypes);
  const selectedSeverities = useFilters((s) => s.severities);
  const selectedProviderIds = useFilters((s) => s.providerIds);

  const filterCount = activeFilterCount({
    serviceTypes: selectedServiceTypes,
    severities: selectedSeverities,
    providerIds: selectedProviderIds,
  });

  // Night is the default; dusk and "match system" are chosen in settings.
  const hydrated = useHydrated();
  useEffect(() => {
    // The pre-paint script in the root layout already set the right class; the
    // hydration pass still reports the server default, so leave it alone until then.
    if (!hydrated) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    // Leaving the map (e.g. to the landing page) restores the default night class.
    return () => document.documentElement.classList.add("dark");
  }, [theme, hydrated]);

  /**
   * Report the outcome of an email confirmation or password reset link.
   *
   * Both emails link through /api/auth, which redirects back here with
   * `?auth=confirmed` or `?auth=reset&token=…` — plus `&error=…` when the link
   * was expired or already used — so the person lands on the map either way.
   * The params are stripped afterwards so a refresh does not repeat the toast.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("auth");
    if (!result) return;

    if (params.get("error")) {
      toast({
        variant: "destructive",
        title: "That link did not work",
        description: "It has expired or was already used. Request a new one.",
      });
    } else if (result === "confirmed") {
      toast({
        title: "Email confirmed",
        description: "Your account is ready. Sign in with your email and password on any device.",
      });
      queryClient.invalidateQueries();
    }

    params.delete("auth");
    params.delete("error");
    params.delete("token");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      window.location.pathname + (query ? `?${query}` : ""),
    );
  }, [toast, queryClient]);

  const handleBoundsChange = useCallback(
    (next: BoundingBox, nextZoom: number) => {
      setBounds(next);
      setZoom(nextZoom);
      setCenter({
        latitude: (next.minLat + next.maxLat) / 2,
        longitude: (next.minLng + next.maxLng) / 2,
      });
    },
    [],
  );

  const handlePick = useCallback((result: GeocodeResult) => {
    setFlyTo({
      latitude: result.latitude,
      longitude: result.longitude,
      zoom: result.zoom,
    });
  }, []);

  const handleUseMyLocation = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      setFlyTo({ ...coords, zoom: 13 });
    },
    [],
  );

  const handleSelect = useCallback((outage: Outage) => {
    setSelectedId(outage.id);
    setListExpanded(false);
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden">
      <h1 className="sr-only">Dimspot live outage map</h1>
      <OutageMap
        outages={outages}
        advisories={showAdvisories ? advisories : []}
        onSelectAdvisory={setSelectedAdvisory}
        selectedId={selectedId}
        onSelect={handleSelect}
        onBoundsChange={handleBoundsChange}
        flyTo={flyTo}
        picking={picking}
        onPickMove={setCenter}
        theme={theme}
      />

      {/* Crosshair for report mode. Fixed to the map centre so the user aims by
          moving the map, which is far steadier one-handed than dragging a pin. */}
      {picking && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full"
        >
          <svg width="34" height="42" viewBox="0 0 34 42" fill="none">
            <path
              d="M17 41C17 41 32 25.5 32 16.5C32 8.2 25.3 1.5 17 1.5S2 8.2 2 16.5C2 25.5 17 41 17 41Z"
              fill="var(--severity-complete)"
              stroke="white"
              strokeWidth="2.5"
            />
            <circle cx="17" cy="16.5" r="5" fill="white" />
          </svg>
        </div>
      )}

      {/* The brand, back to the landing page. Wide screens only: on a phone the
          search bar needs the whole width. */}
      <Link
        href="/"
        className="absolute top-3 left-3 z-30 hidden h-12 items-center gap-2 rounded-2xl border bg-background/85 px-4 text-[15px] font-semibold tracking-[-0.025em] shadow-lg backdrop-blur-xl xl:flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <BrandMark />
        Dimspot
      </Link>

      {/* Above the bottom bar: the search suggestions drop down over the map
          and must not be painted on by the report button below them. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 p-3">
        <div className="pointer-events-auto mx-auto max-w-lg space-y-2">
          {session?.capabilities.demoData && <DemoBanner />}
          <SearchBar
            onPick={handlePick}
            onUseMyLocation={handleUseMyLocation}
            onOpenFilters={() => setFiltersOpen(true)}
            activeFilterCount={filterCount}
          />
          {/* Hidden while placing a report: the map is a picker then, and the
              chips would change what is under the crosshair mid-gesture. */}
          {!picking && <TypeChips />}
        </div>
      </div>

      {/* Settings sits opposite the report button so the two primary actions
          do not crowd the same thumb zone. */}
      {!picking && (
        <div className="absolute bottom-20 left-3 z-10 flex flex-col items-start gap-2">
          <MapLegend className="hidden sm:block" />
          <Button
            variant="secondary"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Alerts and saved places"
            className="h-11 w-11 rounded-full shadow-lg"
          >
            <Settings2 className="h-4 w-4" />
          </Button>

          {/* Only offered where accounts exist at all: the local backend has no
              auth, and a button that cannot work is worse than no button. */}
          {session?.capabilities.accounts && (
            <AccountButton session={session} onClick={() => setAuthOpen(true)} />
          )}
        </div>
      )}

      {!picking && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="pointer-events-auto mx-auto max-w-lg">
            <div className="flex justify-end px-3 pb-3">
              {/* The landing's action button: a sodium pill with a dark chip. */}
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className={cn(
                  "group/report inline-flex h-14 items-center gap-3 rounded-full bg-primary pr-2 pl-6 text-[16px] font-semibold tracking-[-0.01em] text-[#0c1222]",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_14px_32px_-12px_rgba(255,178,26,0.75)]",
                  "transition-[background-color,transform] duration-200 hover:bg-[#ffc24d] active:scale-[0.98]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                Report outage
                <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-[#0c1222] text-primary">
                  <Plus className="h-5 w-5 transition-transform duration-300 group-hover/report:rotate-90" />
                </span>
              </button>
            </div>

            <NearbyPanel
              outages={outages}
              advisories={showAdvisories ? advisories : []}
              loading={isFetching}
              failed={outagesFailed}
              onRetry={refetchOutages}
              center={center}
              expanded={listExpanded}
              onExpandedChange={setListExpanded}
              onSelect={handleSelect}
              onSelectAdvisory={setSelectedAdvisory}
              onReport={() => setReportOpen(true)}
            />
          </div>
        </div>
      )}

      <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} />

      <ReportSheet
        open={reportOpen}
        onOpenChange={setReportOpen}
        pickedLocation={center}
        onRequestPicking={setPicking}
        onReported={setSelectedId}
      />

      <AdvisorySheet
        advisory={selectedAdvisory}
        onOpenChange={(open) => {
          if (!open) setSelectedAdvisory(null);
        }}
      />

      <AuthSheet
        open={authOpen}
        onOpenChange={(open) => {
          setAuthOpen(open);
          if (!open) setResetToken(null);
        }}
        session={session}
        resetToken={resetToken}
        onResetTokenUsed={() => setResetToken(null)}
      />

      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        currentView={{ ...center, zoom }}
        onGoToPlace={(place) =>
          setFlyTo({
            latitude: place.latitude,
            longitude: place.longitude,
            zoom: place.zoom,
          })
        }
      />

      <OutageDetailSheet
        outageId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </main>
  );
}
