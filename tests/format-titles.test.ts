import { describe, expect, it } from "vitest";
import { neighborsLabel, outageTitle } from "@/lib/format";
import type { Outage } from "@/lib/types";

const base = {
  providerName: null,
  serviceType: "power",
  origin: "crowdsourced",
  verificationCount: 1,
} as unknown as Outage;

describe("outageTitle", () => {
  it("names a utility's outage for the utility", () => {
    expect(outageTitle({ ...base, origin: "official", providerName: "Pepco" })).toBe("Pepco");
  });

  it("names a neighbor's report for what is out, not as an unknown provider", () => {
    expect(outageTitle(base)).toBe("Power outage");
    expect(outageTitle({ ...base, serviceType: "internet" })).toBe("Internet outage");
    expect(outageTitle({ ...base, providerName: "Comcast" })).toBe("Comcast");
  });

  it("still says so when a feed outage has no provider", () => {
    expect(outageTitle({ ...base, origin: "official" })).toBe("Unknown provider");
  });
});

describe("neighborsLabel", () => {
  it("counts households, never fewer than the one who reported", () => {
    expect(neighborsLabel(base)).toBe("Reported by 1 neighbor");
    expect(neighborsLabel({ ...base, verificationCount: 3 })).toBe("Reported by 3 neighbors");
    expect(neighborsLabel({ ...base, verificationCount: 0 })).toBe("Reported by 1 neighbor");
  });
});
