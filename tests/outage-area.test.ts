import { describe, expect, it } from "vitest";
import { encodePolyline, type Position } from "@/lib/polyline";
import { buildOutageArea, estimateRadius } from "@/lib/outage-area";

const ring: Position[] = [
  [-77.15, 38.99],
  [-77.1, 38.99],
  [-77.1, 39.02],
  [-77.15, 39.02],
  [-77.15, 38.99],
];

const base = {
  latitude: 39.0,
  longitude: -77.12,
  origin: "official" as const,
  verificationCount: 1,
  customersServed: null,
};

describe("buildOutageArea", () => {
  it("draws the utility's outline with how much of it is out", () => {
    const area = buildOutageArea({
      ...base,
      area: [encodePolyline(ring)],
      customersAffected: 2234,
      customersServed: 25590,
    });
    expect(area).toMatchObject({
      kind: "outline",
      geometry: { type: "Polygon", coordinates: [ring] },
      bounds: [-77.15, 38.99, -77.1, 39.02],
      customersAffected: 2234,
      customersServed: 25590,
    });
  });

  it("does not show a share when the total is smaller than the count out", () => {
    const area = buildOutageArea({
      ...base,
      area: [encodePolyline(ring)],
      customersAffected: 500,
      customersServed: 100,
    });
    expect(area).toMatchObject({ kind: "outline", customersServed: null });
  });

  it("falls back to an estimate when the stored outline is unusable", () => {
    for (const stored of [null, "x", ["not a polyline!"], [42]]) {
      const area = buildOutageArea({ ...base, area: stored, customersAffected: 1000 });
      expect(area).toMatchObject({ kind: "estimate", latitude: 39.0, longitude: -77.12, basis: "customers" });
    }
  });
});

describe("estimateRadius", () => {
  it("grows with the customers out, within bounds", () => {
    const small = estimateRadius({ customersAffected: 20, origin: "official", verificationCount: 1 });
    const mid = estimateRadius({ customersAffected: 2000, origin: "official", verificationCount: 1 });
    const huge = estimateRadius({ customersAffected: 5_000_000, origin: "official", verificationCount: 1 });
    expect(small.radiusMeters).toBe(250);
    expect(mid.radiusMeters).toBeGreaterThan(1000);
    expect(mid.radiusMeters).toBeLessThan(2000);
    expect(huge.radiusMeters).toBe(12_000);
  });

  it("sizes a crowd report by how many households report it", () => {
    const one = estimateRadius({ customersAffected: null, origin: "crowdsourced", verificationCount: 1 });
    const five = estimateRadius({ customersAffected: null, origin: "crowdsourced", verificationCount: 5 });
    const many = estimateRadius({ customersAffected: null, origin: "crowdsourced", verificationCount: 40 });
    expect(one).toEqual({ radiusMeters: 300, basis: "reports" });
    expect(five.radiusMeters).toBe(1100);
    expect(many.radiusMeters).toBe(1500);
  });
});
