"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { shortAddress } from "@/lib/format";
import { stateCode } from "@/lib/us-states";
import { cn } from "@/lib/utils";
import { SERVICE_META, SEVERITY_META } from "@/lib/constants";
import { useCreateOutage, useProviders } from "@/lib/hooks/use-outages";
import { usePreferences } from "@/lib/hooks/use-preferences";
import { useToast } from "@/components/ui/use-toast";
import { SERVICE_TYPES, SEVERITIES } from "@/lib/types";
import type { GeocodeResult, ServiceType, Severity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ServiceIcon } from "@/components/map/markers";
import { ProviderPicker } from "./provider-picker";

/**
 * Report flow (PRD section 4.5): three steps, each one screen, no typing
 * required to finish. The description is optional and comes last so a report
 * can be filed in three taps.
 */

type Step = "service" | "location" | "severity";

const STEP_ORDER: Step[] = ["service", "location", "severity"];

export function ReportSheet({
  open,
  onOpenChange,
  pickedLocation,
  onRequestPicking,
  onReported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Live map centre while the user is positioning the pin. */
  pickedLocation: { latitude: number; longitude: number } | null;
  onRequestPicking: (picking: boolean) => void;
  onReported: (outageId: string) => void;
}) {
  const { data: providers = [], isError: providersFailed } = useProviders();
  const createOutage = useCreateOutage();
  const { toast } = useToast();
  // The person's own providers and home state, when they have saved them:
  // choosing "Power" then pre-selects their power company.
  const { data: saved } = usePreferences();
  const myProviders = saved?.preferences.myProviders ?? {};
  const homeState = saved?.preferences.home?.state ?? null;

  const [step, setStep] = useState<Step>("service");
  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [description, setDescription] = useState("");
  const [place, setPlace] = useState<GeocodeResult | null>(null);
  const [resolvingPlace, setResolvingPlace] = useState(false);

  const providerOptions = useMemo(
    () => providers.filter((p) => p.serviceType === serviceType),
    [providers, serviceType],
  );

  // Reset between reports so the next one starts clean. Done while rendering
  // the close rather than in an effect, so no frame shows the stale form; the
  // effect below already turns picking off whenever the sheet is closed.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setStep("service");
      setServiceType(null);
      setProviderId(null);
      setSeverity(null);
      setDescription("");
      setPlace(null);
    }
  }

  useEffect(() => {
    onRequestPicking(open && step === "location");
  }, [open, step, onRequestPicking]);

  // Reverse-geocode once the pin settles, so the confirmation screen can name a
  // street rather than showing raw coordinates. It starts on the first step,
  // not the second: the state it returns is what lets the provider list lead
  // with the companies that serve this spot.
  const locating = open && step !== "severity";
  useEffect(() => {
    if (!locating || !pickedLocation) return;

    // Dragging the pin again supersedes this lookup. Clearing the timer alone
    // left an in-flight request running, and whichever reply landed last won —
    // so the confirmation screen could name the address of a spot the user had
    // already moved away from.
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setResolvingPlace(true);
      try {
        const response = await fetch(
          `/api/geocode?lat=${pickedLocation.latitude}&lng=${pickedLocation.longitude}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as { results: GeocodeResult[] };
        setPlace(body.results[0] ?? null);
      } catch {
        // An abort is a newer lookup taking over, not a failure: leave both the
        // place and the spinner to the request that replaced this one.
        if (controller.signal.aborted) return;
        setPlace(null);
      } finally {
        if (!controller.signal.aborted) setResolvingPlace(false);
      }
    }, 600);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [locating, pickedLocation]);

  const stepIndex = STEP_ORDER.indexOf(step);

  const canAdvance =
    (step === "service" && serviceType !== null) ||
    (step === "location" && pickedLocation !== null) ||
    (step === "severity" && severity !== null);

  async function submit() {
    if (!serviceType || !severity || !pickedLocation) return;

    try {
      const { outage } = await createOutage.mutateAsync({
        providerId,
        serviceType,
        severity,
        latitude: pickedLocation.latitude,
        longitude: pickedLocation.longitude,
        description: description.trim() || null,
        address: place ? shortAddress(place.label) : null,
        city: place?.city ?? null,
        state: place?.state ?? null,
        zipCode: place?.zipCode ?? null,
      });

      toast({
        title: "Report submitted",
        description: "It is on the map now. Others can confirm it.",
      });

      onOpenChange(false);
      onReported(outage.id);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Could not submit report",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  return (
    // Not modal while the pin is being placed: that step is done on the map,
    // and a modal sheet dims the map and swallows the drag meant for it.
    <Sheet dock open={open} onOpenChange={onOpenChange} modal={step !== "location"}>
      <SheetContent
        side="bottom"
        noOverlay={step === "location"}
        // The steps that are answered in the sheet share one height, so the
        // sheet does not jump as the answers change length. Placing the pin is
        // the exception: it stays short to leave the map in view.
        className={step === "location" ? undefined : "min-h-[min(540px,82dvh)]"}
        // The map is part of this step, so touching it is not "outside".
        onInteractOutside={(event) => {
          if (step === "location") event.preventDefault();
        }}
      >
        <SheetHeader>
          {/* Radix wants a description; the progress bar below says it visually. */}
          <SheetDescription className="sr-only">
            Step {stepIndex + 1} of {STEP_ORDER.length}
          </SheetDescription>
          <SheetTitle className="pr-12">
            {step === "service" && "What is out?"}
            {step === "location" && "Where is it?"}
            {step === "severity" && "How bad is it?"}
          </SheetTitle>

          <div
            className="mt-4 flex gap-1.5"
            role="progressbar"
            aria-valuenow={stepIndex + 1}
            aria-valuemin={1}
            aria-valuemax={STEP_ORDER.length}
          >
            {STEP_ORDER.map((s, index) => (
              <span
                key={s}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  index <= stepIndex ? "bg-foreground" : "bg-secondary",
                )}
              />
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4 pt-1">
          {step === "service" && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {SERVICE_TYPES.map((type) => {
                  const selected = serviceType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setServiceType(type);
                        const mine = type === "other" ? null : (myProviders[type] ?? null);
                        // Only if it is still in the list: a provider can be
                        // retired after someone saved it.
                        setProviderId(
                          mine && providers.some((p) => p.id === mine) ? mine : null,
                        );
                      }}
                      aria-pressed={selected}
                      className={cn(
                        "flex h-[84px] flex-col items-start justify-between rounded-2xl border border-input bg-card p-3.5 transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        // An ink outline on a quiet fill, not an ink fill: the
                        // Next button below is the one solid ink on screen.
                        selected
                          ? "border-foreground bg-card text-foreground shadow-[inset_0_0_0_1px_var(--foreground)]"
                          : "text-foreground hover:border-foreground",
                      )}
                    >
                      <ServiceIcon
                        type={type}
                        className="size-6 stroke-[1.75]"
                      />
                      <span className="text-[15px] font-semibold leading-none">
                        {SERVICE_META[type].shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* The field is optional, so a failed list does not block the
                  report — but say so rather than silently omitting the row. */}
              {serviceType && providersFailed && providerOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Could not load the provider list. You can still send the
                  report without naming a provider.
                </p>
              )}

              {serviceType && providerOptions.length > 0 && (
                <ProviderPicker
                  // Remounted per service type so a search for "pepco" does
                  // not carry over into the cellular list.
                  key={serviceType}
                  providers={providerOptions}
                  // The pin's state once the address resolves; the saved
                  // home's until then, which is usually the same place.
                  stateCode={stateCode(place?.state) ?? homeState}
                  value={providerId}
                  onChange={setProviderId}
                  preferred={
                    serviceType === "other" ? null : (myProviders[serviceType] ?? null)
                  }
                />
              )}
            </div>
          )}

          {step === "location" && (
            <div className="flex items-center gap-3 pb-1">
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground"
              >
                <MapPin className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">
                  {resolvingPlace ? (
                    <span className="font-normal text-muted-foreground">Finding address…</span>
                  ) : place ? (
                    shortAddress(place.label)
                  ) : pickedLocation ? (
                    <span className="tabular-nums">
                      {pickedLocation.latitude.toFixed(4)}, {pickedLocation.longitude.toFixed(4)}
                    </span>
                  ) : (
                    "Move the map to set a location"
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Drag the map until the pin sits on the spot.
                </p>
              </div>
            </div>
          )}

          {step === "severity" && (
            <div className="space-y-5">
              <div className="space-y-2">
                {SEVERITIES.map((option) => {
                  const selected = severity === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setSeverity(option)}
                      aria-pressed={selected}
                      className={cn(
                        "flex min-h-16 w-full items-center gap-3 rounded-2xl border border-input bg-card px-4 py-3 text-left transition-[background-color,border-color] duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        selected
                          ? "border-foreground bg-card shadow-[inset_0_0_0_1px_var(--foreground)]"
                          : "hover:border-foreground",
                      )}
                    >
                      <span
                        aria-hidden
                        style={{ backgroundColor: SEVERITY_META[option].token }}
                        className="size-2.5 shrink-0 rounded-full"
                      />
                      <span className="flex-1">
                        <span className="block text-[15px] font-semibold">
                          {SEVERITY_META[option].label}
                        </span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {SEVERITY_META[option].description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div>
                <Label
                  htmlFor="report-description"
                  className="mb-2 block text-[13px] text-muted-foreground"
                >
                  Anything else? <span className="font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="report-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Out since 2pm, whole street is dark"
                />
              </div>
            </div>
          )}
        </div>

        {/* Back and forward on one row: stacking them puts the primary action
            above the escape hatch, which reads backwards in a wizard. */}
        <SheetFooter className="flex-row items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              if (stepIndex === 0) onOpenChange(false);
              else setStep(STEP_ORDER[stepIndex - 1]);
            }}
          >
            {stepIndex === 0 ? "Cancel" : "Back"}
          </Button>

          {step === "severity" ? (
            <Button
              onClick={submit}
              disabled={!canAdvance || createOutage.isPending}
              className="flex-1"
            >
              {createOutage.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Submit report
            </Button>
          ) : (
            <Button
              onClick={() => setStep(STEP_ORDER[stepIndex + 1])}
              disabled={!canAdvance}
              className="flex-1"
            >
              Next
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
