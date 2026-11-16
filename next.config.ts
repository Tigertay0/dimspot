import type { NextConfig } from "next";

/**
 * Response headers.
 *
 * The app renders no raw HTML — there is no `dangerouslySetInnerHTML` anywhere,
 * and React escapes every string that comes from a feed or a reporter — so
 * these are defence in depth rather than a fix for a known hole. They cost
 * nothing and close the classes of attack that do not need a script injection:
 * framing the map inside another site, and MIME sniffing a response into
 * something executable.
 */
const securityHeaders = [
  // No one embeds this map in their own page. frame-ancestors in the CSP below
  // is the modern form; this is kept for older browsers that ignore it.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // A referrer is useful to the tile host for attribution, but the path can
  // carry a deep-linked outage id, so only the origin travels cross-site.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // HTTPS only, for a year. workers.dev is served over HTTPS already; this
  // stops a downgraded first visit from being the one that leaks a cookie.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Geolocation is requested for "outages near me", from this origin only.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), payment=(), geolocation=(self)",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js hydration and MapLibre's worker need these. 'unsafe-inline'
      // stays until inline scripts carry a per-request nonce; without it the
      // app does not boot, and a stricter policy nobody can ship is worth less
      // than a real one that holds the rest of the line.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
      "worker-src 'self' blob:",
      // Tailwind and the map's own styles are injected at runtime.
      "style-src 'self' 'unsafe-inline'",
      // Basemap tiles and sprites are raster/vector data from the tile host.
      "img-src 'self' data: blob: https://tiles.openfreemap.org",
      // The landing's descent film is fetched from this origin and played from
      // memory (a blob URL) so it can be scrubbed by the scroll.
      "media-src 'self' blob:",
      "font-src 'self' data:",
      // The app's own API (auth included) and the tile host, nothing else.
      "connect-src 'self' https://tiles.openfreemap.org",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

/**
 * The map moved from / to /map when / became the landing page. Links already in
 * the wild (delivered push notifications, installed app shortcuts, auth emails)
 * still point at /?outage=, /?action= or /?auth=, so those keep landing on the map.
 * Next.js carries the query string through to the destination.
 */
const legacyMapQueries = ["outage", "action", "auth"];

const nextConfig: NextConfig = {
  // pg reaches Hyperdrive through pg-cloudflare's Workers socket. Next only
  // traces its Node stub, and the Cloudflare build copies the full Workers
  // version only for packages listed here.
  serverExternalPackages: ["pg", "pg-cloudflare"],
  async redirects() {
    return legacyMapQueries.map((key) => ({
      source: "/",
      has: [{ type: "query" as const, key }],
      destination: "/map",
      permanent: false,
    }));
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The descent film is several megabytes and its file names are not
      // content-hashed, so it is cached for a day and refreshed in the
      // background rather than revalidated on every visit or pinned forever.
      {
        source: "/landing/descent/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
