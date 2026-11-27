import { describe, expect, it } from "vitest";
import { sanitizeFeedRow } from "@/lib/ingest/sanitize";
import type { IngestedOutage } from "@/lib/ingest/source";

const row: IngestedOutage = {
  sourceId: "pepco:20817",
  providerSlug: "pepco",
  utilityName: "Pepco",
  customersAffected: 342,
  reportedAt: "2026-11-26T12:32:00.000Z",
  serviceType: "power",
  severity: "complete",
  latitude: 38.98,
  longitude: -77.1,
  description: "342 customers without power.",
  city: "Bethesda",
  state: "Maryland",
  estimatedRestoration: null,
  active: true,
};

describe("sanitizeFeedRow", () => {
  it("passes a normal row through unchanged", () => {
    expect(sanitizeFeedRow(row)).toEqual(row);
  });

  it("clamps a customer count that would overflow the map query's integer", () => {
    // 2^31 and above made search_outages throw for every viewport holding the row.
    expect(sanitizeFeedRow({ ...row, customersAffected: 2 ** 31 })?.customersAffected).toBe(50_000_000);
    expect(sanitizeFeedRow({ ...row, customersAffected: -5 })?.customersAffected).toBe(0);
    expect(sanitizeFeedRow({ ...row, customersAffected: 12.6 })?.customersAffected).toBe(13);
    expect(sanitizeFeedRow({ ...row, customersAffected: Number.NaN })?.customersAffected).toBeNull();
  });

  it("cuts text to the width of the column it is stored in", () => {
    const clean = sanitizeFeedRow({ ...row, state: "M".repeat(80), city: "B".repeat(300) });

    // One over-long value used to abort the source's whole snapshot.
    expect(clean?.state).toHaveLength(50);
    expect(clean?.city).toHaveLength(100);
  });

  it("drops times that are not times, instead of failing the snapshot on them", () => {
    const clean = sanitizeFeedRow({
      ...row,
      reportedAt: "not a date",
      estimatedRestoration: "0001-01-01T00:00:00Z",
    });

    expect(clean?.reportedAt).toBeNull();
    expect(clean?.estimatedRestoration).toBeNull();
  });

  it("drops a row that cannot be placed or keyed", () => {
    expect(sanitizeFeedRow({ ...row, latitude: 120 })).toBeNull();
    expect(sanitizeFeedRow({ ...row, longitude: Number.POSITIVE_INFINITY })).toBeNull();
    expect(sanitizeFeedRow({ ...row, sourceId: "" })).toBeNull();
    expect(sanitizeFeedRow({ ...row, sourceId: "x".repeat(201) })).toBeNull();
    expect(sanitizeFeedRow({ ...row, severity: "catastrophic" as never })).toBeNull();
  });
});
