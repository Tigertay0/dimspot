import "server-only";
import webpush from "web-push";
import { ALERT_THRESHOLD, MILES_TO_METERS, SERVICE_META, SEVERITY_META } from "./constants";
import { isDatabaseConfigured, query } from "./db";
import { haversineMeters } from "./geo";
import type { NotificationSettings, Outage, Severity } from "./types";
import { isPushServiceEndpoint } from "./validation";

/**
 * Web Push (PRD section 4.7).
 *
 * Push is optional: without VAPID keys the subscribe endpoint reports that it
 * is unavailable and the UI hides the toggle, rather than failing at runtime.
 * Generate a key pair with:
 *
 *   npx web-push generate-vapid-keys
 *
 * Where subscriptions live
 *
 * With a database they are rows in `push_subscriptions`, matched to an outage
 * by distance in SQL (push_targets). They used to live in a Map on the server
 * process, which on serverless meant every cold start forgot every subscriber
 * and each instance knew only the browsers that had registered through it —
 * alerts were close to never delivered. The Map remains only for the local
 * no-database backend, where one process is all there is.
 *
 * An endpoint moves to whoever registers it last (one row per browser), and
 * the identity doing so is always established from the session first.
 *
 * Sending uses `web-push`, which runs on Workers under nodejs_compat (tested on
 * workerd: the encryption and the HTTPS request both work). The VAPID keys are
 * the ones the Vercel deployment used, so existing subscriptions keep working.
 */

export interface SubscriptionInput {
  identity: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  settings: NotificationSettings;
  center: { latitude: number; longitude: number } | null;
  /** IANA zone, e.g. "America/Chicago". Quiet hours are local wall-clock. */
  timezone: string | null;
}

interface Target {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  settings: NotificationSettings;
  timezone: string | null;
}

export function pushConfigured(): boolean {
  const vapid = Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_PUBLIC_KEY !== "YOUR_VAPID_PUBLIC_KEY",
  );
  return vapid;
}

export function publicVapidKey(): string | null {
  return pushConfigured() ? (process.env.VAPID_PUBLIC_KEY ?? null) : null;
}

let vapidSet = false;

function ensureVapid() {
  if (vapidSet) return;

  webpush.setVapidDetails(
    // Push services use this to contact the operator. The old default was an
    // address at a domain this project does not own.
    process.env.VAPID_SUBJECT ?? "https://github.com/Tigertay0/dimspot",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidSet = true;
}

// ---------------------------------------------------------------------------
// Local backend: one process, so a Map is the whole truth.
// ---------------------------------------------------------------------------

const globalSubs = globalThis as unknown as {
  __pushSubs?: Map<string, SubscriptionInput>;
};

function memory(): Map<string, SubscriptionInput> {
  if (!globalSubs.__pushSubs) globalSubs.__pushSubs = new Map();
  return globalSubs.__pushSubs;
}

function meetsThreshold(severity: Severity, threshold: Severity): boolean {
  return SEVERITY_META[severity].rank >= SEVERITY_META[threshold].rank;
}

function memoryTargets(outage: Outage): Target[] {
  return [...memory().values()]
    .filter((sub) => {
      if (!sub.settings.enabled || !sub.center) return false;
      if (sub.identity === outage.reportedBy) return false;
      if (!meetsThreshold(outage.severity, sub.settings.severityThreshold)) {
        return false;
      }
      const distance = haversineMeters(sub.center, outage);
      return distance <= sub.settings.radiusMiles * MILES_TO_METERS;
    })
    .map(({ endpoint, keys, settings, timezone }) => ({
      endpoint,
      keys,
      settings,
      timezone,
    }));
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Register or update this browser's subscription. Idempotent per endpoint. */
export async function saveSubscription(sub: SubscriptionInput): Promise<void> {
  if (!isDatabaseConfigured()) {
    memory().set(sub.endpoint, sub);
    return;
  }

  // One row per browser; a sign-in re-owns it rather than duplicating it.
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys, settings, center, timezone)
     VALUES (
       $1, $2, $3::jsonb, $4::jsonb,
       CASE WHEN $5::float8 IS NULL THEN NULL
            ELSE ST_SetSRID(ST_MakePoint($5::float8, $6::float8), 4326)::geography END,
       $7
     )
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       keys = EXCLUDED.keys,
       settings = EXCLUDED.settings,
       center = EXCLUDED.center,
       timezone = EXCLUDED.timezone`,
    [
      sub.identity,
      sub.endpoint,
      JSON.stringify(sub.keys),
      JSON.stringify(sub.settings),
      sub.center?.longitude ?? null,
      sub.center?.latitude ?? null,
      sub.timezone,
    ],
  );
}

/**
 * Remove a subscription by endpoint.
 *
 * Endpoints are unguessable capability URLs issued to one browser, so holding
 * one is proof of being that browser — no owner check is needed, and requiring
 * one would strand the row whenever the owning identity had changed.
 */
export async function removeSubscription(endpoint: string): Promise<void> {
  if (!isDatabaseConfigured()) {
    memory().delete(endpoint);
    return;
  }

  await query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

async function targetsFor(outage: Outage): Promise<Target[]> {
  if (!isDatabaseConfigured()) return memoryTargets(outage);

  return query<Target>(
    "SELECT endpoint, keys, settings, timezone FROM push_targets($1, $2, $3, $4)",
    [outage.latitude, outage.longitude, outage.severity, outage.reportedBy],
  );
}

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

/** Current wall-clock minutes past midnight in a given IANA zone. */
function minutesNowIn(timezone: string | null, now: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone ?? "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);

    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    // An unrecognised zone string: fall back to UTC rather than dropping the
    // alert entirely.
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/**
 * Quiet hours are "HH:MM" in the subscriber's own time zone.
 *
 * This used to compare against the server clock, which is UTC — so
 * someone in Chicago with 22:00–07:00 quiet hours was silenced from 5pm to 2am
 * local time and woken up overnight.
 */
export function inQuietHours(
  settings: NotificationSettings,
  timezone: string | null,
  now = new Date(),
): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = settings;
  if (!start || !end) return false;

  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  const minutes = minutesNowIn(timezone, now);
  const from = toMinutes(start);
  const to = toMinutes(end);

  // A window like 22:00–07:00 wraps past midnight.
  return from <= to
    ? minutes >= from && minutes < to
    : minutes >= from || minutes < to;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

async function send(target: Target, payload: PushPayload): Promise<boolean> {
  // Checked again here, not only at the edge: a row written before endpoint
  // validation existed, or by anything other than the subscribe route, must
  // still never turn a report into a request to an arbitrary host.
  if (!isPushServiceEndpoint(target.endpoint)) {
    console.error("[push] refusing non-push-service endpoint; removing it");
    await removeSubscription(target.endpoint).catch(() => undefined);
    return false;
  }

  ensureVapid();

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: target.keys },
      JSON.stringify(payload),
    );
    return true;
  } catch (error) {
    // 404/410 mean the browser dropped the subscription; stop sending to it.
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await removeSubscription(target.endpoint).catch((cause) =>
        console.error("[push] could not prune dead subscription", cause),
      );
    } else {
      // Not the error object: web-push attaches the endpoint to it, and an
      // endpoint is the whole credential for a subscription (see saveSubscription).
      console.error(
        "[push] send failed",
        status ?? "no status",
        error instanceof Error ? error.message.slice(0, 200) : "unknown error",
      );
    }
    return false;
  }
}

/**
 * Take the one alert an outage gets, if it has earned it.
 *
 * A report used to be pushed to every subscriber nearby the moment it was
 * filed, carrying text the reporter typed. One request from anyone was an
 * alert of their wording on up to 500 phones. Now a report alerts once, and
 * only when a second network has confirmed it; the UPDATE both checks that
 * and claims the alert, so two confirmations landing together send one.
 */
const localAlerts = new Set<string>();

export async function claimAlert(outage: Outage): Promise<boolean> {
  if (!isDatabaseConfigured()) {
    if (localAlerts.has(outage.id) || outage.status !== "active") return false;
    if (outage.origin === "crowdsourced" && outage.verificationCount < ALERT_THRESHOLD) return false;
    localAlerts.add(outage.id);
    return true;
  }

  const claimed = await query<{ id: string }>(
    `UPDATE outages SET alerted_at = NOW()
     WHERE id = $1 AND alerted_at IS NULL AND status = 'active'
       AND (origin <> 'crowdsourced' OR COALESCE(verification_count, 0) >= $2)
     RETURNING id`,
    [outage.id, ALERT_THRESHOLD],
  );
  return claimed.length > 0;
}

/**
 * Alert nearby subscribers about an outage, at most once, when it qualifies.
 * Safe to call after every report and every confirmation.
 *
 * Must run inside `after()` (on Workers, the request's waitUntil), not as a
 * floating promise: the runtime stops work once the response is sent, and a
 * `void` promise started before that is abandoned partway through the
 * recipient list.
 */
const SEND_BATCH = 20;

export async function alertSubscribers(outage: Outage): Promise<number> {
  if (!pushConfigured()) return 0;
  if (!(await claimAlert(outage))) return 0;

  const targets = (await targetsFor(outage)).filter(
    (target) => !inQuietHours(target.settings, target.timezone),
  );
  if (targets.length === 0) return 0;

  // Nothing the reporter typed: the provider's name comes from the catalog
  // and the rest is fixed wording. Every recipient is inside their own alert
  // radius, so "near you" is true for each of them.
  const what = outage.providerName ?? SERVICE_META[outage.serviceType].shortLabel;

  const payload: PushPayload = {
    title: `${SEVERITY_META[outage.severity].label}: ${what}`,
    body: "Reported near you and confirmed by a neighbor. Tap to see details.",
    url: `/map?outage=${outage.id}`,
    tag: `outage-${outage.id}`,
  };

  // A few at a time: each send is an outbound request plus encryption, and a
  // dead endpoint's cleanup needs one of the request's few database
  // connections.
  let delivered = 0;
  for (let i = 0; i < targets.length; i += SEND_BATCH) {
    const results = await Promise.all(
      targets.slice(i, i + SEND_BATCH).map((target) => send(target, payload)),
    );
    delivered += results.filter(Boolean).length;
  }

  // Starts each recipient's ten-minute cooldown (push_targets skips anyone
  // alerted more recently), so a burst of reports is one buzz, not twenty.
  if (isDatabaseConfigured()) {
    await query("UPDATE push_subscriptions SET last_alerted_at = NOW() WHERE endpoint = ANY($1)", [
      targets.map((target) => target.endpoint),
    ]).catch((error) => console.error("[push] could not start alert cooldown", error));
  }
  return delivered;
}
