import { describe, expect, it } from "vitest";
import { expandStreetTypes, suggestUrl, toSuggestions } from "@/lib/geocode/photon";
import { readApproxLocation } from "@/lib/approx-location";

/** Features in the shape photon.komoot.io returns them (trimmed from real answers). */
function feature(properties: Record<string, unknown>, coordinates: [number, number] = [-77.09, 38.98]) {
  return { type: "Feature", properties, geometry: { type: "Point", coordinates } };
}

const bethesdaNode = feature({
  osm_type: "N", osm_id: 158248181, osm_key: "place", osm_value: "city", type: "city",
  name: "Bethesda", county: "Montgomery", state: "Maryland", countrycode: "US",
});
const bethesdaBoundary = feature({
  osm_type: "R", osm_id: 133482, osm_key: "boundary", osm_value: "statistical", type: "other",
  name: "Bethesda", city: "Bethesda", county: "Montgomery", state: "Maryland", countrycode: "US",
});
const congregation = feature({
  osm_type: "W", osm_id: 203427686, osm_key: "amenity", osm_value: "place_of_worship", type: "house",
  housenumber: "11825", name: "Beth Sholom Congregation", street: "Seven Locks Road",
  city: "Bethesda", state: "Maryland", postcode: "20854", countrycode: "US",
});
const busStop = feature({
  osm_type: "N", osm_id: 1, osm_key: "highway", osm_value: "bus_stop", type: "house",
  name: "Arlington Rd & Bradley Blvd", city: "Bethesda", state: "Maryland", countrycode: "US",
});
const roadSegment = (id: number) =>
  feature({
    osm_type: "W", osm_id: id, osm_key: "highway", osm_value: "secondary", type: "street",
    name: "Bradley Boulevard", city: "Bethesda", county: "Montgomery", state: "Maryland", countrycode: "US",
  });
const zip = feature({
  osm_key: "place", osm_value: "postcode", type: "other", name: "20817",
  county: "Montgomery", state: "Maryland", countrycode: "US",
});
const zipLookalike = feature({
  osm_type: "W", osm_id: 10887692, osm_key: "highway", osm_value: "residential", type: "street",
  name: "2081-7 Westmeadows Ap", city: "Jacksonville", state: "Florida", countrycode: "US",
});

const us = { countries: ["us"] };

describe("toSuggestions", () => {
  it("offers the place and drops the businesses that share its first letters", () => {
    const results = toSuggestions(
      { features: [bethesdaNode, bethesdaBoundary, congregation, busStop] },
      { query: "beth", ...us },
    );

    expect(results.map((r) => r.label)).toEqual(["Bethesda, Maryland"]);
    expect(results[0]).toMatchObject({ zoom: 11, city: "Bethesda", state: "Maryland" });
  });

  it("merges the segments of one road into one suggestion", () => {
    const results = toSuggestions(
      { features: [roadSegment(1), roadSegment(2), roadSegment(3)] },
      { query: "bradley blvd", ...us },
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ label: "Bradley Boulevard, Bethesda, Maryland", zoom: 15 });
  });

  it("keeps a numbered building once a house number is being typed", () => {
    const address = feature({
      osm_type: "N", osm_id: 9, osm_key: "amenity", osm_value: "school", type: "house",
      housenumber: "6700", street: "Bradley Boulevard", name: "A School",
      city: "Bethesda", state: "Maryland", postcode: "20817", countrycode: "US",
    });
    const results = toSuggestions({ features: [address] }, { query: "6700 bradley", ...us });

    expect(results[0]).toMatchObject({
      label: "6700 Bradley Boulevard, Bethesda, Maryland",
      zoom: 16,
      zipCode: "20817",
    });
  });

  it("answers five digits with the ZIP code, not a street that contains them", () => {
    const results = toSuggestions({ features: [zipLookalike, zip] }, { query: "20817", ...us });

    expect(results.map((r) => r.label)).toEqual(["20817, Montgomery County, Maryland"]);
    expect(results[0].zipCode).toBe("20817");
  });

  it("names counties and states as what they are", () => {
    const county = feature({ osm_key: "boundary", osm_value: "administrative", type: "county", name: "Washington", state: "Maryland", countrycode: "US", osm_id: 2, osm_type: "R" });
    const state = feature({ osm_key: "boundary", osm_value: "administrative", type: "state", name: "Washington", countrycode: "US", osm_id: 3, osm_type: "R" });
    const results = toSuggestions({ features: [state, county] }, { query: "washing", ...us });

    expect(results.map((r) => [r.label, r.zoom])).toEqual([
      ["Washington, State", 6],
      ["Washington County, Maryland", 9],
    ]);
  });

  it("drops places outside the allowed countries and malformed features", () => {
    const toronto = feature({ osm_key: "place", osm_value: "city", type: "city", name: "Toronto", state: "Ontario", countrycode: "CA", osm_id: 4, osm_type: "N" });
    const broken = { type: "Feature", properties: { name: "Nowhere" }, geometry: { coordinates: ["x", null] } };
    const results = toSuggestions({ features: [toronto, broken, bethesdaNode] }, { query: "to", ...us });

    expect(results.map((r) => r.label)).toEqual(["Bethesda, Maryland"]);
  });

  it("throws on an answer that is not a feature list, so the client says search is down", () => {
    expect(() => toSuggestions({ message: "rate limited" }, { query: "beth", ...us })).toThrow();
  });
});

describe("suggestUrl", () => {
  it("spells out street types, except in the first word", () => {
    expect(expandStreetTypes("bradley blvd")).toBe("bradley boulevard");
    expect(expandStreetTypes("100 main st.")).toBe("100 main street");
    expect(expandStreetTypes("st louis")).toBe("st louis");
  });

  it("asks for places only, and for buildings once a number is typed", () => {
    const place = new URL(suggestUrl("beth", null)).searchParams;
    expect(place.getAll("layer")).toEqual(["city", "district", "locality", "street", "county", "state"]);

    const address = new URL(suggestUrl("6700 bradley blvd", null)).searchParams;
    expect(address.getAll("layer")).toContain("house");
    expect(address.get("q")).toBe("6700 bradley boulevard");
  });

  it("searches every layer for a ZIP code, which is in none of the named ones", () => {
    expect(new URL(suggestUrl("20817", null)).searchParams.getAll("layer")).toEqual([]);
  });

  it("weights prominence for a place name and distance for a road", () => {
    const near = { latitude: 38.98, longitude: -77.1, zoom: 12 };

    const place = new URL(suggestUrl("chica", near)).searchParams;
    expect([place.get("zoom"), place.get("location_bias_scale")]).toEqual(["9", "0.8"]);

    const road = new URL(suggestUrl("main st", near)).searchParams;
    expect([road.get("zoom"), road.get("location_bias_scale")]).toEqual(["12", "0.2"]);
    expect(road.get("lat")).toBe("38.980");
  });
});

describe("readApproxLocation", () => {
  it("reads Cloudflare's strings and rounds to city level", () => {
    expect(readApproxLocation({ latitude: "38.98470", longitude: "-77.09420", country: "US" })).toEqual({
      latitude: 39,
      longitude: -77.1,
      country: "US",
    });
  });

  it("is null without usable coordinates", () => {
    expect(readApproxLocation(undefined)).toBeNull();
    expect(readApproxLocation({ country: "US" })).toBeNull();
    expect(readApproxLocation({ latitude: "abc", longitude: "1" })).toBeNull();
    expect(readApproxLocation({ latitude: "120", longitude: "1" })).toBeNull();
  });
});
