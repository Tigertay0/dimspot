"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LocateFixed, Minus, Plus, Settings2 } from "lucide-react";
import { DEFAULT_VIEW } from "@/lib/constants";
import { useAdvisories, useOutages, useSession } from "@/lib/hooks/use-outages";
import { activeFilterCount, useFilters } from "@/lib/store/filters";
import type { Advisory, BoundingBox, GeocodeResult, Outage } from "@/lib/types";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { TypeChips } from "@/components/filters/type-chips";
import { MapButton } from "@/components/map/map-button";
import { MapLegend } from "@/components/map/markers";
import { OutageMap, type MapControls, type MapView } from "@/components/map/outage-map";
import { NearbyPanel } from "@/components/layout/nearby-panel";
import { AdvisorySheet } from "@/components/outage/advisory-sheet";
import { OutageDetailSheet } from "@/components/outage/outage-detail-sheet";
import { ReportSheet } from "@/components/report/report-sheet";
import { SearchBar } from "@/components/search/search-bar";
import { AccountButton, AuthSheet } from "@/components/auth/auth-sheet";
import { DemoBanner } from "./demo-banner";
import { NetworkAlerts } from "./network-alerts";
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
  const mapControls = useRef<MapControls | null>(null);

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
  // Outages of a place go on the map; outages of a whole network have no place
  // and are listed as alerts instead.
  const { placed, networkAlerts } = useMemo(
    () => ({
      placed: outages.filter((o) => o.scope !== "national"),
      networkAlerts: outages.filter((o) => o.scope === "national" && o.status === "active"),
    }),
    [outages],
  );
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

  const handleLocateError = useCallback(
    (message: string) =>
      toast({ variant: "destructive", title: "Location unavailable", description: message }),
    [toast],
  );

  const handleSelect = useCallback((outage: Outage) => {
    setSelectedId(outage.id);
    setListExpanded(false);
  }, []);

  return (
    // data-app-shell: globals.css keeps the landing's blanket 44px touch rule
    // out of the app, where every control sizes itself.
    <main data-app-shell className="fixed inset-0 overflow-hidden">
      <h1 className="sr-only">Dimspot live outage map</h1>
      <OutageMap
        outages={placed}
        advisories={showAdvisories ? advisories : []}
        onSelectAdvisory={setSelectedAdvisory}
        selectedId={selectedId}
        onSelect={handleSelect}
        onBoundsChange={handleBoundsChange}
        flyTo={flyTo}
        picking={picking}
        onPickMove={setCenter}
        theme={theme}
        controls={mapControls}
        onLocateError={handleLocateError}
      />

      {/* Crosshair for report mode. Fixed to the map centre so the user aims by
          moving the map, which is far steadier one-handed than dragging a pin. */}
      {picking && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]"
        >
          <svg width="36" height="44" viewBox="0 0 36 44" fill="none">
            <path
              d="M18 42.5C18 42.5 33.5 26.6 33.5 17C33.5 8.4 26.6 1.5 18 1.5S2.5 8.4 2.5 17C2.5 26.6 18 42.5 18 42.5Z"
              fill="var(--primary)"
              stroke="var(--background)"
              strokeWidth="2.5"
            />
            <circle cx="18" cy="17" r="5.5" fill="var(--background)" />
          </svg>
        </div>
      )}

      {/* The brand, back to the landing page. Wide screens only: on a phone the
          search bar needs the whole width. */}
      <Link
        href="/"
        className="glass absolute top-3 left-3 z-30 hidden h-[52px] items-center gap-2 rounded-[18px] px-4 text-[15px] font-semibold tracking-[-0.025em] xl:flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <BrandMark />
        Dimspot
      </Link>

      {/* Above the bottom bar: the search suggestions drop down over the map
          and must not be painted on by the report button below them. The top
          inset keeps the bar under the status bar when installed as an app. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto max-w-lg space-y-2">
          {session?.capabilities.demoData && <DemoBanner />}
          <SearchBar
            onPick={handlePick}
            onOpenFilters={() => setFiltersOpen(true)}
            activeFilterCount={filterCount}
          />
          {/* Hidden while placing a report: the map is a picker then, and the
              chips would change what is under the crosshair mid-gesture. */}
          {!picking && <TypeChips />}
          {!picking && (
            <NetworkAlerts
              alerts={networkAlerts}
              onSelect={handleSelect}
              onShowAll={() => setListExpanded(true)}
            />
          )}
        </div>
      </div>

      {/* Settings and account sit opposite the report button so the primary
          action does not share a thumb zone with them. On a phone they clear
          the list bar and the attribution above it. */}
      {!picking && (
        <div className="absolute bottom-[calc(6.5rem+env(safe-area-inset-bottom,0px))] left-3 z-10 flex flex-col items-start gap-2 sm:bottom-12">
          <MapLegend className="hidden md:block" />
          <MapButton
            onClick={() => setSettingsOpen(true)}
            aria-label="Alerts and saved places"
            title="Alerts and saved places"
          >
            <Settings2 />
          </MapButton>

          {/* Only offered where accounts exist at all: the local backend has no
              auth, and a button that cannot work is worse than no button. */}
          {session?.capabilities.accounts && (
            <AccountButton session={session} onClick={() => setAuthOpen(true)} />
          )}
        </div>
      )}

      {/* Map controls. Locate is always there; zoom buttons only where there
          is a pointer, since a touch screen has pinch. Shown while picking a
          report location too: "where am I" is most of that step. */}
      <div
        className={cn(
          "absolute right-3 z-10 flex flex-col items-end gap-2 sm:bottom-6",
          picking
            ? "top-[calc(5.5rem+env(safe-area-inset-top,0px))] sm:top-auto"
            : "bottom-[calc(8.75rem+env(safe-area-inset-bottom,0px))]",
        )}
      >
        <div className="glass hidden flex-col overflow-hidden rounded-full [@media(pointer:fine)]:flex">
          <button
            type="button"
            onClick={() => mapControls.current?.zoomBy(1)}
            aria-label="Zoom in"
            className="flex size-11 items-center justify-center transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <Plus className="size-[18px]" />
          </button>
          <span aria-hidden className="mx-2.5 h-px bg-border" />
          <button
            type="button"
            onClick={() => mapControls.current?.zoomBy(-1)}
            aria-label="Zoom out"
            className="flex size-11 items-center justify-center transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <Minus className="size-[18px]" />
          </button>
        </div>
        <MapButton
          onClick={() => mapControls.current?.locate()}
          aria-label="Show my location"
          title="Show my location"
        >
          <LocateFixed />
        </MapButton>
      </div>

      {!picking && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="mx-auto max-w-lg">
            {/* Gone while the list is open: the list rises to 62% of the
                screen and would push the button up into the search bar and
                chips. The list has its own way to report when it is empty. */}
            <div className={cn("flex justify-end px-3 pb-3", listExpanded && "hidden")}>
              {/* The landing's action button: a sodium pill with a dark chip. */}
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                className={cn(
                  "group/report pointer-events-auto inline-flex h-14 items-center gap-3 rounded-full bg-primary pr-2 pl-6 text-[16px] font-semibold tracking-[-0.01em] text-[#0c1222]",
                  "shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_14px_32px_-12px_rgba(255,178,26,0.75)]",
                  "transition-[background-color,transform] duration-200 hover:bg-[#ffc24d] active:scale-[0.97]",
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
              outages={placed}
              networkAlerts={networkAlerts}
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
