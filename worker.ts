// Cloudflare entry point: the OpenNext app for requests, plus the feed ingest
// on the Cron Trigger in wrangler.jsonc. Built by wrangler after
// `opennextjs-cloudflare build`.
// @ts-nocheck: .open-next/worker.js only exists after a build.
import app from "./.open-next/worker.js";

const FALLBACK_ORIGIN = "https://dimspot.adetayo.dev";

export default {
  fetch: app.fetch,

  // Runs /api/ingest through the app itself, so it gets the same request
  // context (Hyperdrive, env) as any other request. The route checks
  // CRON_SECRET, which this handler holds as a Worker secret.
  async scheduled(_controller, env, ctx) {
    const origin = env.BETTER_AUTH_URL || FALLBACK_ORIGIN;
    const request = new Request(new URL("/api/ingest", origin), {
      method: "POST",
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });

    ctx.waitUntil(
      Promise.resolve(app.fetch(request, env, ctx)).then(
        async (response) => {
          const body = await response.text();
          if (response.ok) {
            console.log(`[cron] ingest ${response.status}: ${body.slice(0, 1500)}`);
          } else {
            console.error(`[cron] ingest failed ${response.status}: ${body.slice(0, 500)}`);
          }
        },
        (error) => console.error("[cron] ingest threw", error instanceof Error ? error.message : error),
      ),
    );
  },
};
