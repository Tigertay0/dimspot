import { describe, expect, it } from "vitest";
import {
  boundsOf,
  clipToCircle,
  decodePolyline,
  encodePolyline,
  reachOf,
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

describe("clipToCircle", () => {
  // A 2 x 2 degree square on the equator, where a degree is a degree both ways.
  const square = {
    type: "Polygon" as const,
    coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]] as Position[]],
  };

  it("shows nothing before the spread starts and all of it once it has passed every corner", () => {
    expect(clipToCircle(square, [0, 0], 0)).toBeNull();
    const reach = reachOf([-1, -1, 1, 1], [0, 0]);
    expect(reach).toBeCloseTo(Math.SQRT2, 6);
    const full = clipToCircle(square, [0, 0], reach * 1.01);
    const bounds = boundsOf(full!);
    bounds.forEach((value, i) => expect(value).toBeCloseTo([-1, -1, 1, 1][i], 6));
  });

  it("is the circle while the circle is inside the shape", () => {
    const small = clipToCircle(square, [0, 0], 0.5);
    expect(small?.type).toBe("Polygon");
    const ring = (small as { coordinates: Position[][] }).coordinates[0];
    for (const [x, y] of ring) expect(Math.hypot(x, y)).toBeCloseTo(0.5, 6);
  });

  it("grows from an off-centre point and keeps only the part inside", () => {
    // From the square's corner: a quarter of the circle is inside. The circle
    // is a 48-gon, so its rim is within 0.0002 of a true circle here.
    const corner = clipToCircle(square, [-1, -1], 0.5);
    const [west, south, east, north] = boundsOf(corner!);
    expect(west).toBeCloseTo(-1, 6);
    expect(south).toBeCloseTo(-1, 6);
    expect(east).toBeCloseTo(-0.5, 3);
    expect(north).toBeCloseTo(-0.5, 3);
  });

  it("keeps a hole that the spread has reached", () => {
    const withHole = {
      type: "Polygon" as const,
      coordinates: [
        [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]],
        [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2], [-0.2, -0.2]],
      ] as Position[][],
    };
    const clipped = clipToCircle(withHole, [0.5, 0], 0.8) as { coordinates: Position[][] };
    expect(clipped.coordinates).toHaveLength(2);
  });
});
