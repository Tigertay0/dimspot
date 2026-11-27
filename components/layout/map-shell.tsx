"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { House, Minus, Navigation, Plus } from "lucide-react";
import { DEFAULT_VIEW } from "@/lib/constants";
import { useAdvisories, useOutages, useSession } from "@/lib/hooks/use-outages";
import { activeFilterCount, useFilters } from "@/lib/store/filters";
import type { Advisory, BoundingBox, GeocodeResult, Outage } from "@/lib/types";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import { FilterSheet } from "@/components/filters/filter-sheet";
import { CoverageNote, TypeTabs } from "@/components/filters/type-chips";
import { Button } from "@/components/ui/button";
import { SheetDockTarget } from "@/components/ui/sheet";
import { OutageMap, type MapControls, type MapView } from "@/components/map/outage-map";
import { NearbyPanel } from "@/components/layout/nearby-panel";
import { AdvisorySheet } from "@/components/outage/advisory-sheet";
import { OutageDetailSheet } from "@/components/outage/outage-detail-sheet";
import { OutagePreview } from "@/components/outage/outage-preview";
import { ReportSheet } from "@/components/report/report-sheet";
import { SearchBar } from "@/components/search/search-bar";
import { AuthSheet } from "@/components/auth/auth-sheet";
import { DemoBanner } from "./demo-banner";
import { NetworkAlerts } from "./network-alerts";
import { SettingsSheet } from "./settings-sheet";
import { useAppearance } from "@/lib/hooks/use-appearance";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useIsDesktop } from "@/lib/hooks/use-is-desktop";

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
  const [searchOpen, setSearchOpen] = useState(false);
  // From 1024px the list is a column beside the map, and detail and report
  // open in that column instead of over the map.
  const desktop = useIsDesktop();
  const [dockTarget, setDockTarget] = useState<HTMLElement | null>(null);
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
  const { data: saved } = usePreferences();
  const home = saved?.preferences.home ?? null;

  /**
   * Open on the saved home, once.
   *
   * Someone who saved where they live is asking about that street, not about
   * the country. Skipped when the page was opened on a specific outage (a
   * notification or a shared link), which has its own place to show.
   */
  // Decided while rendering, as the report sheet does for its reset: an
  // effect would paint the country view first and then set state from it.
  const [openedOnHome, setOpenedOnHome] = useState(false);
  if (home && !openedOnHome) {
    setOpenedOnHome(true);
    if (selectedId === null) {
      setFlyTo({ latitude: home.latitude, longitude: home.longitude, zoom: 12 });
    }
  }
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
    severities: selectedSeverities,
    providerIds: selectedProviderIds,
  });
  // One type alone: say what that layer can see, in place of the alert pill.
  const coverageNote = selectedServiceTypes.length === 1;

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

  // A marker opens the preview card; the card, a list row or a network alert
  // opens the full sheet.
  const [previewId, setPreviewId] = useState<string | null>(null);

  const handleMarker = useCallback((outage: Outage) => {
    setPreviewId(outage.id);
    setListExpanded(false);
  }, []);

  const handleSelect = useCallback((outage: Outage) => {
    setSelectedId(outage.id);
    setListExpanded(false);
  }, []);

  const preview = previewId ? (placed.find((o) => o.id === previewId) ?? null) : null;

  const openReport = useCallback(() => setReportOpen(true), []);

  const list = (
    <NearbyPanel
      docked={desktop}
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
      onReport={openReport}
    />
  );

  return (
    // data-app-shell: globals.css keeps the landing's blanket 44px touch rule
    // out of the app, where every control sizes itself.
    <main data-app-shell className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <h1 className="sr-only">Dimspot live outage map</h1>

      {/* One solid header, as in the reference apps: search, then the service
          tabs. It is in the flow, so the map starts under it and nothing on the
          map can show through. The top inset keeps it under the status bar
          when installed as an app. */}
      <header className="relative z-30 shrink-0 bg-card pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_1px_0_var(--border)]">
        <Link
          href="/"
          className="absolute left-5 top-[max(0.75rem,env(safe-area-inset-top))] hidden h-14 items-center gap-2 text-base font-semibold tracking-[-0.02em] lg:flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <BrandMark />
          Dimspot
        </Link>

        <div className="mx-auto max-w-lg px-4">
          {session?.capabilities.demoData && <DemoBanner />}
          <SearchBar
            onPick={handlePick}
            onOpenFilters={() => setFiltersOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenChange={setSearchOpen}
            activeFilterCount={filterCount}
            signedIn={Boolean(session?.identity.email)}
          />
          <TypeTabs className="mt-1" />
        </div>

        {/* On a wide screen the report button lives here; on a phone it floats
            over the map, within thumb reach. */}
        <div className="absolute right-5 top-[max(0.75rem,env(safe-area-inset-top))] hidden h-14 items-center lg:flex">
          <Button onClick={openReport} className="gap-2 rounded-full pr-5 pl-4">
            <Plus className="size-[18px]" strokeWidth={2.5} />
            Report outage
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* The list column. Detail and report open inside it (Sheet dock), so
            the map beside it is never covered. */}
        {desktop && (
          <aside
            ref={setDockTarget}
            className="relative z-20 flex w-[400px] shrink-0 flex-col border-r bg-card"
          >
            {list}
          </aside>
        )}

        <div className="relative min-w-0 flex-1" data-preview={preview ? "" : undefined}>
          <OutageMap
            outages={placed}
            advisories={showAdvisories ? advisories : []}
            onSelectAdvisory={setSelectedAdvisory}
            selectedId={previewId ?? selectedId}
            onSelect={desktop ? handleSelect : handleMarker}
            onBackgroundClick={() => setPreviewId(null)}
            onBoundsChange={handleBoundsChange}
            flyTo={flyTo}
            picking={picking}
            onPickMove={setCenter}
            theme={theme}
            controls={mapControls}
            onLocateError={handleLocateError}
          />

          {/* The pin for report mode, fixed over the map's centre so the user
              aims by moving the map. On a phone the map is padded by the
              sheet's height while picking (outage-map.tsx), so its centre is
              the middle of the part still showing; the pin is raised by half
              of that to sit on it. Beside the docked sheet nothing is covered. */}
          {picking && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[calc(50%-min(140px,25%))] z-10 -translate-x-1/2 -translate-y-full drop-shadow-[0_4px_6px_rgba(0,0,0,0.3)] lg:top-1/2"
            >
              <svg width="36" height="44" viewBox="0 0 36 44" fill="none">
                <path
                  d="M18 42.5C18 42.5 33.5 26.6 33.5 17C33.5 8.4 26.6 1.5 18 1.5S2.5 8.4 2.5 17C2.5 26.6 18 42.5 18 42.5Z"
                  fill="#111111"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <circle cx="18" cy="17" r="5.5" fill="#ffffff" />
              </svg>
            </div>
          )}

          {/* Over the map's top edge: what the map has to say on the left (a
              network alert, or what a layer can see: one at a time), the
              controls on the right. Out of the way while search results show. */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start gap-2 px-3 pt-3",
              searchOpen && "invisible",
            )}
          >
            <div className="min-w-0 flex-1">
              {!picking &&
                (coverageNote ? (
                  <CoverageNote />
                ) : (
                  <NetworkAlerts
                    alerts={networkAlerts}
                    onSelect={handleSelect}
                    onShowAll={() => setListExpanded(true)}
                  />
                ))}
            </div>

            <div className="panel pointer-events-auto flex shrink-0 flex-col overflow-hidden rounded-xl [&>button+button]:border-t">
              {home && (
                <ControlButton
                  label="Go to my home"
                  onClick={() =>
                    // A new object each time, so pressing it again after panning
                    // away flies back.
                    setFlyTo({ latitude: home.latitude, longitude: home.longitude, zoom: 13 })
                  }
                >
                  <House />
                </ControlButton>
              )}
              <ControlButton label="Show my location" onClick={() => mapControls.current?.locate()}>
                <Navigation />
              </ControlButton>
              <ControlButton
                label="Zoom in"
                onClick={() => mapControls.current?.zoomBy(1)}
                className="hidden [@media(pointer:fine)]:flex"
              >
                <Plus />
              </ControlButton>
              <ControlButton
                label="Zoom out"
                onClick={() => mapControls.current?.zoomBy(-1)}
                className="hidden [@media(pointer:fine)]:flex"
              >
                <Minus />
              </ControlButton>
            </div>
          </div>

          {!desktop && !picking && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
              <div className="mx-auto max-w-lg">
                {/* Above the sheet: the preview of the tapped marker, or else
                    the report button. Neither shows while the list is open,
                    which rises to 62% of the screen. */}
                {!listExpanded && (
                  <div className="px-3 pb-3">
                    {preview ? (
                      <OutagePreview
                        outage={preview}
                        onOpen={() => setSelectedId(preview.id)}
                        onClose={() => setPreviewId(null)}
                      />
                    ) : (
                      <div className="flex justify-end">
                        <Button
                          onClick={openReport}
                          className="pointer-events-auto gap-2 rounded-full pr-5 pl-4 shadow-[var(--shadow-float)]"
                        >
                          <Plus className="size-[18px]" strokeWidth={2.5} />
                          Report outage
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {list}
              </div>
            </div>
          )}
        </div>
      </div>

      <SheetDockTarget.Provider value={dockTarget}>
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
        onShowHome={(place) =>
          setFlyTo({ latitude: place.latitude, longitude: place.longitude, zoom: 13 })
        }
        onAccount={
          session?.capabilities.accounts
            ? () => {
                setSettingsOpen(false);
                setAuthOpen(true);
              }
            : undefined
        }
      />

      <OutageDetailSheet
        outageId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
      </SheetDockTarget.Provider>
    </main>
  );
}

/** One cell of the map-control stack. */
function ControlButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex size-11 items-center justify-center text-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none [&_svg]:size-[18px]",
        className,
      )}
    >
      {children}
    </button>
  );
}
