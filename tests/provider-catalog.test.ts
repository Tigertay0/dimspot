import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FALLBACK_PROVIDER_SLUGS, PROVIDER_CATALOG } from "@/lib/data/provider-catalog";
import { providerSlugFor, utilityName } from "@/lib/ingest/odin";
import { stateCode } from "@/lib/us-states";

const migration = readFileSync("db/migrations/0007_more_providers.sql", "utf8");

describe("provider catalog", () => {
  it("has no repeated slug, and includes Pepco", () => {
    const slugs = PROVIDER_CATALOG.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(PROVIDER_CATALOG.find((p) => p.slug === "pepco")).toMatchObject({
      name: "Pepco",
      serviceType: "power",
      regions: ["DC", "MD"],
    });
  });

  it("uses only real state codes for regions", () => {
    for (const provider of PROVIDER_CATALOG) {
      for (const region of provider.regions) {
        expect(stateCode(region), `${provider.slug}: ${region}`).toBe(region);
      }
    }
  });

  it("keeps every slug the first seed migration created", () => {
    const seeded = readFileSync("db/migrations/0004_seed_providers.sql", "utf8");
    const slugs = [...seeded.matchAll(/^\s*\('[0-9a-f-]{36}', '([a-z0-9-]+)'/gm)].map((m) => m[1]);
    expect(slugs.length).toBeGreaterThan(20);
    const catalog = new Set(PROVIDER_CATALOG.map((p) => p.slug));
    for (const slug of slugs) expect(catalog.has(slug), slug).toBe(true);
  });

  it("is seeded row for row by migration 0007", () => {
    const rows = new Map(
      [...migration.matchAll(/^\s*\('([a-z0-9-]+)', '((?:[^']|'')+)', '(\w+)', (ARRAY\[[^\]]*\]|'\{\}')\)/gm)].map(
        (m) => [
          m[1],
          {
            name: m[2].replace(/''/g, "'"),
            serviceType: m[3],
            regions: [...m[4].matchAll(/'([A-Z]{2})'/g)].map((r) => r[1]),
          },
        ],
      ),
    );

    expect(rows.size).toBe(PROVIDER_CATALOG.length);
    for (const provider of PROVIDER_CATALOG) {
      expect(rows.get(provider.slug), provider.slug).toEqual({
        name: provider.name,
        serviceType: provider.serviceType,
        regions: provider.regions,
      });
    }
  });

  it("lists the catch-all rows as fallbacks", () => {
    for (const slug of FALLBACK_PROVIDER_SLUGS) {
      expect(PROVIDER_CATALOG.some((p) => p.slug === slug), slug).toBe(true);
    }
  });
});

describe("stateCode", () => {
  it("accepts a name or a code in any case", () => {
    expect(stateCode("Maryland")).toBe("MD");
    expect(stateCode("district of columbia")).toBe("DC");
    expect(stateCode("md")).toBe("MD");
  });

  it("returns null for anything else", () => {
    expect(stateCode("Ontario")).toBeNull();
    expect(stateCode("")).toBeNull();
    expect(stateCode(null)).toBeNull();
  });
});

describe("ODIN utility names", () => {
  it("drops the id the feed appends, numeric or not", () => {
    expect(utilityName("MONONGAHELA POWER CO,12796")).toBe("Monongahela Power Co");
    expect(utilityName("AVISTA CORP,avista")).toBe("Avista Corp");
    expect(utilityName("PUGET SOUND ENERGY INC,pugetsoundenergy")).toBe("Puget Sound Energy Inc");
  });

  it("keeps a comma that is part of the name", () => {
    expect(utilityName("NORTHERN NECK ELEC COOP, INC")).toBe("Northern Neck Elec Coop, Inc");
    expect(utilityName("HOLY CROSS ELECTRIC ASSN, INC,holycrossenergy")).toBe("Holy Cross Electric Assn, Inc");
  });

  it("links the utilities that are in the catalog", () => {
    const catalog = new Set(PROVIDER_CATALOG.map((p) => p.slug));
    const cases: Array<[string, string | null, string | null]> = [
      ["Metropolitan Edison Co", "Pennsylvania", "met-ed"],
      ["The Potomac Edison Company", "Maryland", "potomac-edison"],
      ["Pacificorp", "Oregon", "pacific-power"],
      ["Pacificorp", "Utah", "rocky-mountain-power"],
      ["Pennsylvania Electric Co", "Pennsylvania", "penelec"],
      ["Pennsylvania Power Co", "Pennsylvania", "penn-power"],
      ["Great Lakes Energy Coop", "Michigan", null],
    ];
    for (const [name, state, slug] of cases) {
      expect(providerSlugFor(name, state), name).toBe(slug);
      if (slug) expect(catalog.has(slug), slug).toBe(true);
    }
  });
});
