import { setWorkerUrl } from "maplibre-gl";

/**
 * MapLibre 6 ships its tile worker as a separate module and, by default, looks
 * for it next to its own file (`import.meta.url`). Once bundled, that resolves
 * to a chunk folder the worker was never copied to, so the map logs "Worker
 * failed to load" and never draws tiles.
 *
 * `new URL(..., import.meta.url)` with a literal path is a pattern Turbopack and
 * webpack both recognise: they emit the (self-contained) worker as a hashed,
 * same-origin asset and put its real URL here. Same-origin keeps the CSP at
 * `worker-src 'self'`. This must run before the first map is created, so every
 * module that renders a map imports this file for its side effect.
 */
if (typeof window !== "undefined") {
  setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
}
