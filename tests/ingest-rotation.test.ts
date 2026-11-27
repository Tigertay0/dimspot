import { afterEach, describe, expect, it, vi } from "vitest";
import { KUBRA_UTILITIES, kubraSourceName } from "@/lib/ingest/kubra";
import { sourcesForRun } from "@/lib/ingest/run";

const MINUTES_20 = 20 * 60 * 1000;
const utilityNames = new Set(KUBRA_UTILITIES.map((u) => kubraSourceName(u.slug)));
const utilitiesIn = (now: number) =>
  sourcesForRun(now).map((s) => s.name).filter((name) => utilityNames.has(name));

afterEach(() => vi.unstubAllEnvs());

describe("sourcesForRun", () => {
  it("polls the core sources on every run", () => {
    for (const run of [0, 1, 2]) {
      const names = sourcesForRun(run * MINUTES_20).map((s) => s.name);
      expect(names).toEqual(expect.arrayContaining(["nws", "odin", "ioda", "cloudflare-radar", "radar-anomalies"]));
    }
  });

  it("reads at most ten utility maps a run, and reaches every one within a cycle", () => {
    const seen = new Set<string>();
    for (let run = 0; run < 3; run++) {
      const batch = utilitiesIn(run * MINUTES_20);
      expect(batch.length).toBeLessThanOrEqual(10);
      expect(batch.length).toBeGreaterThan(0);
      for (const name of batch) {
        // No map is read twice within one cycle.
        expect(seen.has(name), name).toBe(false);
        seen.add(name);
      }
    }
    expect(seen).toEqual(utilityNames);
  });

  it("reads every map every run when the budget allows", () => {
    vi.stubEnv("KUBRA_UTILITIES_PER_RUN", "100");
    expect(utilitiesIn(0).length).toBe(KUBRA_UTILITIES.length);
    expect(utilitiesIn(MINUTES_20).length).toBe(KUBRA_UTILITIES.length);
  });

  it("ignores a setting that is not a positive whole number", () => {
    vi.stubEnv("KUBRA_UTILITIES_PER_RUN", "lots");
    expect(utilitiesIn(0).length).toBeLessThanOrEqual(10);
  });
});

describe("zoneLookupBudget", () => {
  it("is forty lookups a run while the utility maps are off", async () => {
    const { zoneLookupBudget } = await import("@/lib/ingest/nws");

    expect(zoneLookupBudget()).toBe(40);
  });

  it("gives way to the utility maps on the free plan's 50 requests", async () => {
    const { zoneLookupBudget } = await import("@/lib/ingest/nws");
    vi.stubEnv("KUBRA_INGEST", "on");

    expect(zoneLookupBudget()).toBe(12);
    vi.stubEnv("KUBRA_UTILITIES_PER_RUN", "10");
    expect(zoneLookupBudget()).toBe(12);
  });

  it("keeps all forty on a paid plan, signalled by reading more maps per run", async () => {
    const { zoneLookupBudget } = await import("@/lib/ingest/nws");
    vi.stubEnv("KUBRA_INGEST", "on");
    vi.stubEnv("KUBRA_UTILITIES_PER_RUN", "24");

    expect(zoneLookupBudget()).toBe(40);
  });
});
