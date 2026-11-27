import { describe, expect, it } from "vitest";
import {
  boundsOf,
  decodePolyline,
  encodePolyline,
  ringsToGeometry,
  simplify,
  type Position,
} from "@/lib/polyline";

describe("encoded polylines", () => {
  it("decodes Google's reference line", () => {
    // From Google's polyline algorithm documentation.
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("round-trips through encode and decode", () => {
    const ring: Position[] = [
      [-77.12345, 38.98765],
      [-77.1, 39.0],
      [-77.05, 38.95],
      [-77.12345, 38.98765],
    ];
    expect(decodePolyline(encodePolyline(ring))).toEqual(ring);
  });

  it("rejects text that is not a polyline", () => {
    expect(decodePolyline("not a polyline!")).toBeNull();
    // A truncated value: the continuation bit is set on the last character.
    expect(decodePolyline("_p~iF~ps|U_")).toBeNull();
  });
});

describe("simplify", () => {
  it("drops points that do not change the shape and keeps the corners", () => {
    const square: Position[] = [
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 0.5],
      [1, 1],
      [0.5, 1.00001],
      [0, 1],
      [0, 0],
    ];
    expect(simplify(square, 0.001)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });
});

describe("ringsToGeometry", () => {
  const box = (x: number, y: number, size: number): Position[] => [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];

  it("makes a ring inside a larger one a hole in it", () => {
    const geometry = ringsToGeometry([box(2, 2, 1), box(0, 0, 10)]);
    expect(geometry).toEqual({ type: "Polygon", coordinates: [box(0, 0, 10), box(2, 2, 1)] });
  });

  it("keeps separate pieces separate", () => {
    const geometry = ringsToGeometry([box(0, 0, 1), box(5, 5, 1)]);
    expect(geometry?.type).toBe("MultiPolygon");
    expect(boundsOf(geometry!)).toEqual([0, 0, 6, 6]);
  });

  it("closes an open ring and ignores a degenerate one", () => {
    const open: Position[] = [
      [0, 0],
      [1, 0],
      [1, 1],
    ];
    const geometry = ringsToGeometry([open, [[3, 3]]]);
    expect(geometry).toEqual({ type: "Polygon", coordinates: [[...open, [0, 0]]] });
    expect(ringsToGeometry([])).toBeNull();
  });
});
