import { Phone } from "../phone";
import { StickyStory } from "../ui/sticky-story";
import { VerticalCutReveal } from "../ui/vertical-cut-reveal";

/** Act 4: the turn. Three steps, one phone that stays put while the real app plays on it. */
export function ActFindOut() {
  return (
    <section id="how" data-tone="night" className="scroll-mt-16 bg-night pt-16 pb-24">
      <div className="mx-auto max-w-[1200px] px-6 max-[640px]:px-4">
        <h2 className="max-w-3xl font-display text-[clamp(36px,5.2vw,76px)] leading-[1.02] font-semibold tracking-[-0.04em] text-lamp">
          <VerticalCutReveal>Find out in seconds</VerticalCutReveal>
        </h2>
        <StickyStory
          className="mt-8"
          steps={[
            {
              title: "Report what's out, in three taps",
              body: "Pick the service, drop the pin, say how bad it is. No typing needed, and neighbours see it on the map straight away.",
              media: <Phone clip="report" />,
            },
            {
              title: "See what's out around you",
              body: "Utility outages and neighbours' reports sit on one map, with how many people are affected and for how long. If a neighbour reported it, tap “I’m affected too” to add yourself.",
              media: <Phone clip="confirm" />,
            },
            {
              title: "Get told the moment it's back",
              body: "Save your street and turn on alerts. When an outage near you is resolved, you hear about it first.",
              media: <Phone clip="alerts" />,
            },
          ]}
        />
      </div>
    </section>
  );
}
