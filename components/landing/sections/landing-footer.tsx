import Link from "next/link";

export function LandingFooter() {
  return (
    <footer data-tone="night" className="border-t border-lamp/10 bg-night">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-6 py-12 max-[640px]:px-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-display text-[24px] leading-none font-semibold tracking-[-0.03em] text-lamp">Dimspot</p>
          <p className="mt-3 max-w-sm text-[15px] leading-[1.5] text-lamp-soft">
            Power, internet and cell outages on one live map. Numbers on this page are examples.
          </p>
        </div>
        <div className="flex flex-col gap-3 text-[14px] text-lamp-soft md:items-end">
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/map" className="text-lamp hover:underline">
              Live map
            </Link>
            <a href="#how" className="text-lamp hover:underline">
              How it works
            </a>
          </nav>
          <p>The city and street pictures on this page are generated, not photographs of a real place</p>
        </div>
      </div>
    </footer>
  );
}
