"use client";

import { useState } from "react";
import { ChevronDown, House, Loader2, LocateFixed, MapPin, Trash2 } from "lucide-react";
import { SERVICE_META } from "@/lib/constants";
import { useProviders } from "@/lib/hooks/use-outages";
import { stateCode, US_STATE_NAMES } from "@/lib/us-states";
import type { GeocodeResult, HomeLocation, MyProviders } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ServiceIcon } from "@/components/map/markers";
import { ProviderPicker } from "@/components/report/provider-picker";
import { cn } from "@/lib/utils";

const HOME_SERVICES = ["power", "internet", "cellular"] as const;
type HomeService = (typeof HOME_SERVICES)[number];

/**
 * Where the person lives and who supplies them.
 *
 * Saved with the rest of their settings, so it follows their account. The map
 * opens on the home, alerts are aimed at it, and the report form starts on
 * their own power, internet or mobile provider instead of a list.
 */
export function HomeSettings({
  home,
  myProviders,
  mapCentre,
  onHomeChange,
  onProvidersChange,
  onShowHome,
}: {
  home: HomeLocation | null;
  myProviders: MyProviders;
  mapCentre: { latitude: number; longitude: number } | null;
  onHomeChange: (home: HomeLocation | null) => void;
  onProvidersChange: (providers: MyProviders) => void;
  onShowHome: (home: HomeLocation) => void;
}) {
  const { data: providers = [] } = useProviders();
  const [busy, setBusy] = useState<"gps" | "map" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openService, setOpenService] = useState<HomeService | null>(null);

  /** Name the spot, so the card shows a street rather than coordinates. */
  async function setHomeAt(point: { latitude: number; longitude: number }) {
    let label = `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
    let state: string | null = null;

    try {
      const response = await fetch(
        `/api/geocode?lat=${point.latitude}&lng=${point.longitude}`,
      );
      if (response.ok) {
        const body = (await response.json()) as { results: GeocodeResult[] };
        const place = body.results[0];
        if (place) {
          label = place.label.split(",").slice(0, 3).join(",").trim().slice(0, 160);
          state = stateCode(place.state);
        }
      }
    } catch {
      // The coordinates are the home; the name is a nicety.
    }

    onHomeChange({ label, latitude: point.latitude, longitude: point.longitude, state });
  }

  async function setFromMapCentre() {
    if (!mapCentre) return;
    setBusy("map");
    setError(null);
    await setHomeAt(mapCentre);
    setBusy(null);
  }

  function setFromDevice() {
    if (!("geolocation" in navigator)) {
      setError("This browser cannot share a location. Use the map center instead.");
      return;
    }
    setBusy("gps");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await setHomeAt({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setBusy(null);
      },
      (failure) => {
        setError(
          failure.code === failure.PERMISSION_DENIED
            ? "Location access is blocked for this site. Move the map to your home and use the map center."
            : "Could not get your location. Move the map to your home and use the map center.",
        );
        setBusy(null);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <section>
      <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">Home</h3>

      {home ? (
        <div className="flex items-center gap-3 py-1">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
          >
            <House className="size-[18px]" />
          </span>
          <button
            type="button"
            onClick={() => onShowHome(home)}
            className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:underline"
          >
            <span className="block truncate text-[15px] font-semibold">{home.label}</span>
            <span className="block truncate text-[13px] text-muted-foreground">
              {home.state ? `${US_STATE_NAMES[home.state] ?? home.state} · ` : ""}
              Tap to show on the map
            </span>
          </button>
          <button
            type="button"
            onClick={() => onHomeChange(null)}
            aria-label="Remove home"
            className="tap-target flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : (
        <p className="text-sm leading-snug text-muted-foreground">
          The map opens here and alerts are aimed here.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={setFromDevice}
          disabled={busy !== null}
          className="min-w-0 flex-1 px-3"
        >
          {busy === "gps" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          <span className="truncate">Use my location</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={setFromMapCentre}
          disabled={busy !== null || !mapCentre}
          className="min-w-0 flex-1 px-3"
        >
          {busy === "map" ? <Loader2 className="animate-spin" /> : <MapPin />}
          <span className="truncate">Use map center</span>
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <h3 className="mb-1 mt-5 text-[13px] font-medium text-muted-foreground">
        Your providers
      </h3>
      <div className="divide-y">
        {HOME_SERVICES.map((service) => {
          const options = providers.filter((p) => p.serviceType === service);
          const chosen = options.find((p) => p.id === myProviders[service]);
          const open = openService === service;

          return (
            <div key={service}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenService(open ? null : service)}
                className="flex h-12 w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <ServiceIcon type={service} className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">
                  {SERVICE_META[service].shortLabel}
                </span>
                <span
                  className={cn(
                    "max-w-[55%] truncate text-sm",
                    chosen ? "font-medium" : "text-muted-foreground",
                  )}
                >
                  {chosen?.name ?? "Not set"}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    open && "rotate-180",
                  )}
                />
              </button>

              {open && (
                <div className="pb-4">
                  <ProviderPicker
                    label={`${SERVICE_META[service].shortLabel} provider`}
                    providers={options}
                    stateCode={home?.state ?? null}
                    value={myProviders[service] ?? null}
                    onChange={(id) => {
                      onProvidersChange({ ...myProviders, [service]: id });
                      if (id) setOpenService(null);
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
