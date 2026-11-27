"use client";

import { useState } from "react";
import {
  ArrowUp,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCw,
  ThumbsUp,
} from "lucide-react";
import {
  VERIFICATION_THRESHOLD,
  isDetected,
  sourceAttribution,
  sourceLabel,
} from "@/lib/constants";
import { dayAndTime, locationLabel, outageDuration, pluralize, timeAgo } from "@/lib/format";
import type { OutageDetail } from "@/lib/types";
import {
  useAddComment,
  useConfirmOutage,
  useOutageDetail,
  useResolveOutage,
} from "@/lib/hooks/use-outages";
import { buildTimeline } from "@/lib/timeline";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { ServiceBadge, SeverityLabel } from "@/components/map/markers";
import { OutageTimeline } from "./outage-timeline";

/**
 * Outage detail (PRD sections 4.1, 4.6, 4.9).
 *
 * Confirm is the primary action and sits above the fold on every screen size —
 * it is the single interaction the crowdsourcing model depends on.
 */
export function OutageDetailSheet({
  outageId,
  onOpenChange,
}: {
  outageId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: outage, isLoading, isError, refetch } = useOutageDetail(outageId);
  const confirm = useConfirmOutage(outageId ?? "");
  const resolve = useResolveOutage(outageId ?? "");
  const addComment = useAddComment(outageId ?? "");
  const { toast } = useToast();

  const [draft, setDraft] = useState("");

  async function submitComment() {
    const text = draft.trim();
    if (!text) return;

    try {
      await addComment.mutateAsync(text);
      setDraft("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Comment not posted",
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  function toastFailure(title: string) {
    return (error: unknown) =>
      toast({
        variant: "destructive",
        title,
        description: error instanceof Error ? error.message : "Please try again.",
      });
  }

  const isResolved = outage?.status === "resolved";
  const remaining = outage
    ? Math.max(0, VERIFICATION_THRESHOLD - outage.verificationCount)
    : 0;

  return (
    <Sheet open={outageId !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            {/* Radix requires a title on every dialog for screen readers, so
                the loading state announces itself rather than opening silent. */}
            <SheetTitle className="sr-only">Loading outage details</SheetTitle>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !outage ? (
          // Without this branch a failed or missing fetch left `isLoading`
          // false and `outage` undefined, so the spinner above span on forever.
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <SheetTitle className="text-base">
              {isError ? "Could not load this outage" : "Outage not found"}
            </SheetTitle>
            <SheetDescription className="max-w-xs">
              {isError
                ? "Something went wrong fetching the details."
                : "It may have been removed since you last looked."}
            </SheetDescription>
            {isError && (
              <Button variant="secondary" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            )}
          </div>
        ) : (
          <>
            <SheetHeader className="pr-12">
              <div className="flex items-center gap-3">
                <ServiceBadge type={outage.serviceType} size="lg" />

                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">
                    {outage.providerName ?? "Unknown provider"}
                  </SheetTitle>
                  <p className="mt-1 truncate text-[15px] text-muted-foreground">
                    {locationLabel(outage)}
                  </p>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6">
              {/* One line of status: what it is, and how far to trust it. */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-4 text-[15px]">
                <SeverityLabel
                  severity={outage.severity}
                  resolved={isResolved}
                  className="font-semibold"
                />
                <span aria-hidden className="text-muted-foreground">·</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  {outage.origin === "official" ? (
                    // A utility saying so and a measurement suggesting so are
                    // different claims; only the first gets the tick.
                    isDetected(outage.sourceName) ? (
                      "Detected, not confirmed"
                    ) : (
                      <>
                        <BadgeCheck className="size-3.5" />
                        Official report
                      </>
                    )
                  ) : outage.isVerified ? (
                    <>
                      <BadgeCheck className="size-3.5" />
                      Verified by neighbours
                    </>
                  ) : (
                    "Not yet confirmed"
                  )}
                </span>
              </p>

              <Facts outage={outage} />

              {outage.description && (
                <p className="pt-4 text-[15px] leading-relaxed">
                  {outage.description}
                </p>
              )}

              {/* Radar's own description already says how it knows. */}
              {outage.origin === "official" && outage.sourceName !== "radar-anomalies" && (
                <p className="pt-2 text-sm leading-snug text-muted-foreground">
                  {sourceAttribution(outage.sourceName)}
                </p>
              )}

              {!isResolved && outage.origin === "crowdsourced" && (
                <div className="pt-4">
                  <div className="flex gap-2">
                    <Button
                      variant={outage.confirmedByMe ? "secondary" : "default"}
                      onClick={() =>
                        confirm.mutate(!outage.confirmedByMe, {
                          onError: toastFailure("Could not update your confirmation"),
                        })
                      }
                      disabled={confirm.isPending}
                      aria-pressed={outage.confirmedByMe}
                      className="min-w-0 flex-1 px-4"
                    >
                      {outage.confirmedByMe ? <CheckCircle2 /> : <ThumbsUp />}
                      <span className="truncate">
                        {outage.confirmedByMe ? "You confirmed" : "I'm affected too"}
                      </span>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() =>
                        resolve.mutate(undefined, {
                          onError: toastFailure("Could not record that it's back"),
                        })
                      }
                      disabled={resolve.isPending}
                      className="px-4"
                    >
                      It&apos;s back
                    </Button>
                  </div>

                  {remaining > 0 && (
                    <p className="pt-2 text-xs text-muted-foreground">
                      {remaining} more {pluralize(remaining, "confirmation")} to
                      mark this verified.
                    </p>
                  )}
                </div>
              )}

              <Tabs defaultValue="updates" className="pb-6 pt-5">
                <TabsList>
                  <TabsTrigger value="updates">
                    Updates
                    {outage.comments.length > 0 && (
                      <span className="tabular-nums opacity-60">
                        {outage.comments.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="updates" className="pt-4">
                  {/* In the tab it belongs to, not pinned under the sheet:
                      pinned, it took the room the updates need on a phone. */}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitComment();
                    }}
                    className="flex h-12 items-center gap-1 rounded-full border border-input bg-card pr-1.5 pl-4 transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/15"
                  >
                    <input
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Add an update…"
                      maxLength={500}
                      aria-label="Add an update"
                      // 16px, or iOS Safari zooms the page when the field is focused.
                      className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || addComment.isPending}
                      aria-label="Post update"
                      className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[background-color,opacity,transform] duration-150 hover:bg-primary/85 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:bg-secondary disabled:text-muted-foreground"
                    >
                      {addComment.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ArrowUp className="size-4" strokeWidth={2.25} />
                      )}
                    </button>
                  </form>

                  {outage.comments.length === 0 ? (
                    <p className="flex items-center gap-2 pt-4 text-sm text-muted-foreground">
                      <MessageSquare className="size-4 shrink-0" />
                      No updates yet. Add the first one.
                    </p>
                  ) : (
                    <ul className="pt-2">
                      {outage.comments.map((comment) => (
                        <li
                          key={comment.id}
                          className="border-b py-2.5 text-sm last:border-b-0"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium">
                              {comment.authorLabel}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {timeAgo(comment.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 leading-snug text-muted-foreground">
                            {comment.comment}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>

                <TabsContent value="timeline" className="pt-4">
                  <OutageTimeline events={buildTimeline(outage)} />
                </TabsContent>
              </Tabs>
            </div>

          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The facts, as a key and value list on hairlines: how long, how many, when,
 * and who says so. A row only appears when there is a value for it. Figures
 * are set in the mono face so they line up down the column.
 */
function Facts({ outage }: { outage: OutageDetail }) {
  const isResolved = outage.status === "resolved";

  const facts: Array<{ label: string; value: string; mono?: boolean }> = [
    isResolved
      ? { label: "Lasted", value: outageDuration(outage), mono: true }
      : outage.startKnown
        ? { label: "Out for", value: outageDuration(outage), mono: true }
        : { label: "First seen", value: timeAgo(outage.reportedAt), mono: true },
  ];

  if (outage.customersAffected !== null) {
    facts.push({
      label: "Customers affected",
      value: outage.customersAffected.toLocaleString(),
      mono: true,
    });
  } else if (outage.origin === "crowdsourced") {
    facts.push({
      label: "Confirmed by",
      value: `${outage.verificationCount} ${pluralize(outage.verificationCount, "person", "people")}`,
      mono: true,
    });
  }

  if (outage.estimatedRestoration && !isResolved) {
    facts.push({
      label: "Expected back",
      value: dayAndTime(outage.estimatedRestoration),
      mono: true,
    });
  }

  facts.push({
    label: outage.startKnown ? "Started" : "Reported",
    value: dayAndTime(outage.reportedAt),
    mono: true,
  });

  if (outage.origin === "official") {
    facts.push({ label: "Source", value: sourceLabel(outage.sourceName) });
  }

  return (
    <dl className="divide-y border-y text-[15px]">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline justify-between gap-4 py-3.5">
          <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
          <dd className="truncate font-semibold tabular-nums">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
