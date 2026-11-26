"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";
import { stateCode } from "@/lib/us-states";
import { cn } from "@/lib/utils";
import { SERVICE_META, SEVERITY_META } from "@/lib/constants";
import { useCreateOutage, useProviders } from "@/lib/hooks/use-outages";
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
        address: place?.label.split(",").slice(0, 2).join(",").trim() ?? null,
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Content-sized. The location step's content is short, so the sheet
        // stays out of the way of the crosshair at the map centre.
      >
        <SheetHeader>
          <SheetDescription className="pr-12 text-xs font-medium">
            Step {stepIndex + 1} of {STEP_ORDER.length}
          </SheetDescription>
          <SheetTitle>
            {step === "service" && "What is out?"}
            {step === "location" && "Where is it out?"}
            {step === "severity" && "How bad is it?"}
          </SheetTitle>

          <div
            className="mt-2.5 flex gap-1.5"
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
                  index <= stepIndex ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-1">
          {step === "service" && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-2">
                {SERVICE_TYPES.map((type) => {
                  const selected = serviceType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setServiceType(type);
                        setProviderId(null);
                      }}
                      aria-pressed={selected}
                      className={cn(
                        "flex h-[76px] flex-col items-center justify-center gap-2 rounded-2xl border transition-[background-color,border-color,transform] duration-150 active:scale-[0.97]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        // A sodium outline and wash, not a sodium fill: the
                        // Next button below is the one solid sodium on screen.
                        selected
                          ? "border-primary bg-primary/14 text-foreground"
                          : "border-input text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <ServiceIcon
                        type={type}
                        className={cn("size-[22px]", selected && "text-primary")}
                      />
                      <span className="text-[13px] font-medium leading-none">
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
                  stateCode={stateCode(place?.state)}
                  value={providerId}
                  onChange={setProviderId}
                />
              )}
            </div>
          )}

          {step === "location" && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Drag the map until the pin sits on the spot.
              </p>
              <div className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3.5">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                >
                  <MapPin className="size-4" />
                </span>
                <div className="min-w-0 flex-1 self-center leading-snug">
                  {resolvingPlace ? (
                    <span className="text-muted-foreground">
                      Finding address…
                    </span>
                  ) : place ? (
                    <span className="break-words">{place.label}</span>
                  ) : pickedLocation ? (
                    <span className="tabular-nums text-muted-foreground">
                      {pickedLocation.latitude.toFixed(4)},{" "}
                      {pickedLocation.longitude.toFixed(4)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Move the map to set a location
                    </span>
                  )}
                </div>
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
                        "flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-[background-color,border-color] duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        selected
                          ? "border-primary bg-primary/14"
                          : "border-input hover:bg-accent",
                      )}
                    >
                      <span
                        aria-hidden
                        style={{ backgroundColor: SEVERITY_META[option].token }}
                        className="size-3 shrink-0 rounded-full"
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold">
                          {SEVERITY_META[option].label}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {SEVERITY_META[option].description}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {selected && <Check className="size-3" strokeWidth={3} />}
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
