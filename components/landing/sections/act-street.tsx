import Image from "next/image";
import { PYLON } from "@/lib/landing/photos";
import { OutageCard } from "../ui/outage-card";
import { WaveLines } from "../ui/wave-lines";

/** Act 5: substance. People plus public feeds, across every service. Cards are labeled examples. */
export function ActStreet() {
  return (
    <section data-tone="night" className="bg-night pb-16">
      <div className="relative isolate h-[70vh] min-h-[480px] overflow-hidden">
        {/* On wide screens the crop sits lower, so the lit lamp and the rose horizon are in the band,
            and the picture is mirrored so the lamp glows beside the headline instead of behind it. */}
        <Image
          src={PYLON.src}
          alt={PYLON.alt}
          fill
          sizes="100vw"
          className="-z-20 object-cover object-[50%_35%] md:-scale-x-100 md:object-[50%_47%]"
        />
        {/* The picture is already graded to the night palette; a light navy wash just seats it in the page. */}
        <div aria-hidden className="absolute inset-0 -z-20 bg-night/30 mix-blend-multiply" />
        {/* Continuous with act 4 above: the night fades into the photo instead of cutting. */}
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[22%] bg-gradient-to-b from-night to-transparent" />
        <WaveLines lines={7} amplitude={36} className="-z-10 text-lamp opacity-75 [mask-image:linear-gradient(to_bottom,black_30%,transparent_55%)]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-[55%] bg-gradient-to-t from-night via-night/70 to-transparent" />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 -z-10 h-[45%] backdrop-blur-[12px] [mask-image:linear-gradient(to_top,black_35%,transparent)]"
        />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[1200px] px-6 pb-12 max-[640px]:px-4">
          <h2 className="max-w-3xl font-display text-[clamp(36px,5.2vw,76px)] leading-[1.02] font-semibold tracking-[-0.04em] text-lamp">
            Reports from your neighbours, next to public outage feeds
          </h2>
          <p className="mt-4 max-w-2xl text-[20px] leading-[1.5] text-lamp-soft max-[640px]:hidden">
            Power, internet and cell on one map. Open a card to see where it is.
          </p>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-[1200px] px-6 max-[640px]:mt-6 max-[640px]:px-4">
        {/* On phones the lead sits here, off the photo, where the power lines can't run behind it. */}
        <p className="mb-6 text-[18px] leading-[1.5] text-lamp-soft min-[641px]:hidden">
          Power, internet and cell on one map. Open a card to see where it is.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          <OutageCard
            service="Power"
            place="Maple Ave and 4th St"
            severity="complete"
            detail="No power across four blocks since 7:40 pm"
            confirmations={23}
            latitude={39.9612}
            longitude={-82.9988}
          />
          <OutageCard
            service="Internet"
            place="Riverside, Building C"
            severity="degraded"
            detail="Fibre connections dropping every few minutes"
            confirmations={9}
            latitude={39.9532}
            longitude={-83.0102}
          />
          <OutageCard
            service="Cell"
            place="Market St, downtown"
            severity="intermittent"
            detail="Calls failing indoors on one network"
            confirmations={14}
            latitude={39.9668}
            longitude={-82.9911}
          />
        </div>
      </div>
    </section>
  );
}
