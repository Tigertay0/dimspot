"use client";

import { useState } from "react";
import {
  ArrowUp,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  ThumbsUp,
} from "lucide-react";
import {
  SEVERITY_META,
  VERIFICATION_THRESHOLD,
  sourceAttribution,
} from "@/lib/constants";
import { clockTime, dayAndTime, locationLabel, outageDuration, pluralize, timeAgo } from "@/lib/format";
import type { OutageDetail } from "@/lib/types";
import {
  useAddComment,
  useConfirmOutage,
  useOutageDetail,
  useResolveOutage,
} from "@/lib/hooks/use-outages";
import { buildTimeline } from "@/lib/timeline";
import { Badge } from "@/components/ui/badge";
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
import { ServiceBadge } from "@/components/map/markers";
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
            <SheetHeader className="pr-14">
              <div className="flex items-center gap-3">
                <ServiceBadge
                  type={outage.serviceType}
                  severity={outage.severity}
                  resolved={isResolved}
                  size="lg"
                />

                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">
                    {outage.providerName ?? "Unknown provider"}
                  </SheetTitle>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{locationLabel(outage)}</span>
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant={isResolved ? "resolved" : outage.severity} dot>
                  {isResolved
                    ? "Resolved"
                    : SEVERITY_META[outage.severity].label}
                </Badge>

                {outage.origin === "official" ? (
                  <Badge variant="outline">
                    <BadgeCheck />
                    Official
                  </Badge>
                ) : outage.isVerified ? (
                  <Badge variant="outline">
                    <BadgeCheck />
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="muted">Unconfirmed</Badge>
                )}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5">
              <Facts outage={outage} />

              {outage.description && (
                <p className="pt-4 text-[15px] leading-relaxed">
                  {outage.description}
                </p>
              )}

              {outage.origin === "official" && (
                <p className="pt-3 text-[13px] leading-snug text-muted-foreground">
                  {sourceAttribution(outage.sourceName)}
                </p>
              )}

              {!isResolved && outage.origin === "crowdsourced" && (
                <div className="pt-4">
                  <div className="flex gap-2">
                    <Button
                      size="lg"
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
                      size="lg"
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

              <Tabs defaultValue="updates" className="pb-4 pt-5">
                <TabsList className="w-full">
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

                <TabsContent value="updates" className="pt-3">
                  {outage.comments.length === 0 ? (
                    <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                      <MessageSquare className="size-4 shrink-0" />
                      No updates yet. Add the first one.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {outage.comments.map((comment) => (
                        <li
                          key={comment.id}
                          className="rounded-2xl bg-muted/60 px-3.5 py-2.5 text-sm"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-semibold">
                              {comment.authorLabel}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
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

            <div className="border-t px-5 pb-3 pt-3">
              {/* One field with the send button inside it: a 44px button next
                  to a 48px input never lined up, and the pair read as two
                  controls rather than one composer. */}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitComment();
                }}
                className="flex h-12 items-center gap-1 rounded-full border border-input bg-background/60 pr-1.5 pl-4 transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25"
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Add an update…"
                  maxLength={500}
                  aria-label="Add an update"
                  // 16px, or iOS Safari zooms the page when the field is focused.
                  className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/80"
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || addComment.isPending}
                  aria-label="Post update"
                  className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-[#ffc24d] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:bg-muted disabled:text-muted-foreground"
                >
                  {addComment.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ArrowUp className="size-[18px]" strokeWidth={2.5} />
                  )}
                </button>
              </form>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The numbers, as a row of cells rather than more pills: how long, how many,
 * and when it is expected back. A cell only appears when there is a value for
 * it, so the row is two or three wide and never shows a dash.
 */
function Facts({ outage }: { outage: OutageDetail }) {
  const isResolved = outage.status === "resolved";

  const facts: Array<{ label: string; value: string; hint?: string }> = [
    isResolved
      ? { label: "Lasted", value: outageDuration(outage) }
      : outage.startKnown
        ? { label: "Out for", value: outageDuration(outage) }
        : { label: "First seen", value: timeAgo(outage.reportedAt) },
  ];

  if (outage.customersAffected !== null) {
    facts.push({
      label: outage.customersAffected === 1 ? "Customer" : "Customers",
      value: outage.customersAffected.toLocaleString(),
    });
  } else if (outage.origin === "crowdsourced") {
    facts.push({
      label: "Confirmed by",
      value: `${outage.verificationCount}`,
      hint: pluralize(outage.verificationCount, "person", "people"),
    });
  }

  if (outage.estimatedRestoration && !isResolved) {
    facts.push({ label: "Back by", value: clockTime(outage.estimatedRestoration) });
  } else {
    facts.push({ label: "Reported", value: dayAndTime(outage.reportedAt) });
  }

  return (
    <dl
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}
    >
      {facts.map((fact) => (
        <div key={fact.label} className="rounded-2xl bg-muted/60 px-3 py-2.5">
          <dt className="text-[11px] font-medium text-muted-foreground">
            {fact.label}
          </dt>
          <dd className="mt-0.5 truncate text-[15px] font-semibold tracking-[-0.01em] tabular-nums">
            {fact.value}
            {fact.hint && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {fact.hint}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
