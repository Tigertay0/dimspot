import { describe, expect, it } from "vitest";
import { SEED_PROVIDERS } from "@/lib/data/seed";
import { suggestProviders } from "@/lib/provider-suggestions";
import { preferencesSchema } from "@/lib/validation";

const of = (type: string) => SEED_PROVIDERS.filter((p) => p.serviceType === type);
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("suggestProviders", () => {
  it("leads with the power companies that serve the pin's state", () => {
    const { shown, local } = suggestProviders(of("power"), { stateCode: "MD" });
    expect(ids(shown)).toEqual(["pepco", "bge", "delmarva", "potomac-edison", "smeco", "local-power"]);
    expect(local).toBe(5);
  });

  it("shows the largest utilities when the state is not known", () => {
    const shown = ids(suggestProviders(of("power")).shown);
    for (const famous of ["pge", "sce", "fpl", "duke", "coned", "comed", "pepco"]) {
      expect(shown, famous).toContain(famous);
    }
    // The catch-all is offered, but last.
    expect(shown.at(-1)).toBe("local-power");
  });

  it("falls back to the largest utilities for a state none of them serve", () => {
    // No listed power company operates in Guam.
    expect(ids(suggestProviders(of("power"), { stateCode: "GU" }).shown)).toContain("pge");
  });

  it("orders internet and mobile providers largest first, not alphabetically", () => {
    expect(ids(suggestProviders(of("internet")).shown).slice(0, 4)).toEqual([
      "xfinity",
      "spectrum",
      "att-internet",
      "cox",
    ]);
    expect(ids(suggestProviders(of("cellular")).shown).slice(0, 3)).toEqual(["verizon", "att", "tmobile"]);
  });

  it("puts the person's own provider first, wherever the pin is", () => {
    const { shown } = suggestProviders(of("power"), { stateCode: "CA", preferred: "pepco" });
    expect(shown[0].id).toBe("pepco");
    expect(ids(shown)).toContain("pge");
  });

  it("searches the whole list and can show all of it", () => {
    expect(ids(suggestProviders(of("power"), { stateCode: "MD", query: "dominion" }).shown)).toEqual(["dominion"]);
    expect(suggestProviders(of("power"), { all: true }).shown).toHaveLength(of("power").length);
  });
});

describe("preferencesSchema", () => {
  const base = {
    serviceTypes: ["power"],
    providerIds: [],
    severities: ["complete"],
    savedLocations: [],
    notifications: {
      enabled: false,
      severityThreshold: "complete",
      radiusMiles: 5,
      quietHoursStart: null,
      quietHoursEnd: null,
    },
    defaultCenter: null,
  };

  it("accepts a payload from before home and providers existed", () => {
    const parsed = preferencesSchema.parse(base);
    expect(parsed.home).toBeNull();
    expect(parsed.myProviders).toEqual({});
  });

  it("accepts a home and providers", () => {
    const parsed = preferencesSchema.parse({
      ...base,
      home: { label: "6700 Bradley Boulevard, Bethesda", latitude: 38.99, longitude: -77.12, state: "MD" },
      myProviders: { power: "pepco", internet: "xfinity", cellular: null },
    });
    expect(parsed.home?.state).toBe("MD");
    expect(parsed.myProviders).toEqual({ power: "pepco", internet: "xfinity", cellular: null });
  });

  it("rejects a home off the map, a state that is not a code, and a slug that is not a slug", () => {
    const home = { label: "x", latitude: 38.99, longitude: -77.12, state: "MD" };
    expect(preferencesSchema.safeParse({ ...base, home: { ...home, latitude: 123 } }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, home: { ...home, state: "Maryland" } }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, myProviders: { power: "Pepco; DROP" } }).success).toBe(false);
  });
});
