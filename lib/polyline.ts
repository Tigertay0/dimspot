/**
 * Google encoded polylines (precision 5), the format utility outage maps use
 * for an area's outline, plus the small amount of geometry needed to store an
 * outline compactly and draw it: simplification, and turning rings into a
 * GeoJSON polygon with its holes in the right place.
 *
 * Coordinates are [longitude, latitude], GeoJSON order, throughout.
 */

export type Position = [number, number];

const PRECISION = 1e5;

/** Every point of one encoded line. Returns null on anything malformed. */
export function decodePolyline(encoded: string): Position[] | null {
  const points: Position[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  function next(): number | null {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) return null;
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
      // More than 32 bits is not a coordinate delta.
      if (shift > 30) return null;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  }

  while (index < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat === null || dLng === null) return null;
    lat += dLat;
    lng += dLng;
    const point: Position = [lng / PRECISION, lat / PRECISION];
    if (Math.abs(point[1]) > 90 || Math.abs(point[0]) > 180) return null;
    points.push(point);
  }
  return points;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

export function encodePolyline(points: Position[]): string {
  let out = "";
  let lat = 0;
  let lng = 0;
  for (const [x, y] of points) {
    const nextLat = Math.round(y * PRECISION);
    const nextLng = Math.round(x * PRECISION);
    out += encodeValue(nextLat - lat) + encodeValue(nextLng - lng);
    lat = nextLat;
    lng = nextLng;
  }
  return out;
}

function distanceToSegment(p: Position, a: Position, b: Position): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas-Peucker, iterative so a long ring cannot overflow the stack.
 * `tolerance` is in degrees; the first and last points are always kept, so a
 * closed ring stays closed.
 */
export function simplify(points: Position[], tolerance: number): Position[] {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let max = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

/** Shoelace area in square degrees; only compared, never shown. */
function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return Math.abs(sum / 2);
}

function contains(ring: Position[], [x, y]: Position): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function closed(ring: Position[]): Position[] {
  const [a, b] = [ring[0], ring[ring.length - 1]];
  return a[0] === b[0] && a[1] === b[1] ? ring : [...ring, a];
}

export type AreaGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

/**
 * Rings as a utility map lists them, as one GeoJSON geometry.
 *
 * The maps give a flat list: a ZIP made of several pieces lists each piece,
 * and an enclave inside a ZIP is listed as one more ring. A ring that sits
 * inside a larger one is taken as a hole in it; the rest are separate pieces.
 */
export function ringsToGeometry(rings: Position[][]): AreaGeometry | null {
  const usable = rings.filter((ring) => ring.length >= 3).map(closed);
  if (usable.length === 0) return null;

  // Largest first, so every hole is met after the piece that contains it.
  const sorted = usable
    .map((ring) => ({ ring, area: ringArea(ring) }))
    .sort((a, b) => b.area - a.area);

  const pieces: Position[][][] = [];
  for (const { ring } of sorted) {
    const host = pieces.find((piece) => contains(piece[0], ring[0]));
    if (host) host.push(ring);
    else pieces.push([ring]);
  }

  return pieces.length === 1
    ? { type: "Polygon", coordinates: pieces[0] }
    : { type: "MultiPolygon", coordinates: pieces };
}

export function boundsOf(geometry: AreaGeometry): [number, number, number, number] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * The part of `geometry` inside a circle around `center`, for drawing an area
 * as if it spreads out from a point. Works in a local plane where a degree of
 * longitude is scaled to a degree of latitude, so the circle is round on the
 * map. `radius` is in degrees of latitude.
 *
 * Sutherland-Hodgman against a 48-sided polygon: exact for the convex clip
 * shape, and for a concave area it can leave zero-width slivers along the
 * circle, which a fill does not show. Returns null when nothing is inside yet.
 */
export function clipToCircle(
  geometry: AreaGeometry,
  center: Position,
  radius: number,
): AreaGeometry | null {
  if (radius <= 0) return null;
  const [cx, cy] = center;
  const k = Math.cos((cy * Math.PI) / 180) || 1;

  const SIDES = 48;
  const clip: Position[] = [];
  for (let i = 0; i < SIDES; i++) {
    const a = (i / SIDES) * 2 * Math.PI;
    clip.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }

  const toLocal = ([x, y]: Position): Position => [(x - cx) * k, y - cy];
  const toWorld = ([x, y]: Position): Position => [x / k + cx, y + cy];

  function clipRing(ring: Position[]): Position[] | null {
    let output = ring.slice(0, -1).map(toLocal);
    for (let i = 0; i < SIDES && output.length > 0; i++) {
      const a = clip[i];
      const b = clip[(i + 1) % SIDES];
      // Inside is the left of a -> b, since the clip polygon is anticlockwise.
      const inside = (p: Position) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
      const cross = (p: Position, q: Position): Position => {
        const dx = q[0] - p[0];
        const dy = q[1] - p[1];
        const ex = b[0] - a[0];
        const ey = b[1] - a[1];
        const t = (ex * (a[1] - p[1]) - ey * (a[0] - p[0])) / (ex * dy - ey * dx);
        return [p[0] + t * dx, p[1] + t * dy];
      };
      const input = output;
      output = [];
      for (let j = 0; j < input.length; j++) {
        const current = input[j];
        const previous = input[(j + input.length - 1) % input.length];
        if (inside(current)) {
          if (!inside(previous)) output.push(cross(previous, current));
          output.push(current);
        } else if (inside(previous)) {
          output.push(cross(previous, current));
        }
      }
    }
    if (output.length < 3) return null;
    const world = output.map(toWorld);
    return [...world, world[0]];
  }

  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const pieces: Position[][][] = [];
  for (const polygon of polygons) {
    const outer = clipRing(polygon[0]);
    if (!outer) continue;
    const holes = polygon.slice(1).map(clipRing).filter((ring): ring is Position[] => ring !== null);
    pieces.push([outer, ...holes]);
  }

  if (pieces.length === 0) return null;
  return pieces.length === 1
    ? { type: "Polygon", coordinates: pieces[0] }
    : { type: "MultiPolygon", coordinates: pieces };
}

/** Distance from `center` to the farthest corner of `bounds`, in degrees of latitude. */
export function reachOf(bounds: [number, number, number, number], [cx, cy]: Position): number {
  const k = Math.cos((cy * Math.PI) / 180) || 1;
  const [west, south, east, north] = bounds;
  let max = 0;
  for (const x of [west, east]) {
    for (const y of [south, north]) {
      max = Math.max(max, Math.hypot((x - cx) * k, y - cy));
    }
  }
  return max;
}
