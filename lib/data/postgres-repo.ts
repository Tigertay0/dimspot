import { iso, PG, pgCode, query, transaction } from "@/lib/db";
import type {
  Advisory,
  BoundingBox,
  CreateOutageInput,
  Outage,
  OutageComment,
  OutageDetail,
  OutageQuery,
  Provider,
  ServiceType,
  Severity,
  UserPreferences,
} from "@/lib/types";
import {
  DEFAULT_PREFERENCES,
  InvalidInputError,
  type Repository,
} from "./repository";

/**
 * Postgres/PostGIS backend (Neon, through Hyperdrive on the live site).
 *
 * This is the authorization layer. The database is reached only by server
 * code, so there is no row level security behind it: every write takes the
 * acting identity from the caller (who got it from the session, never from the
 * request body) and only ever touches that identity's rows — a confirmation is
 * withdrawn with `user_id = identity`, a comment is attributed to the identity,
 * preferences are keyed on it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An id that cannot name a row. Answered as "not found", not as a 500. */
function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Row shape returned by search_outages (db/migrations/0002_app.sql). */
interface SearchRow {
  id: string;
  provider_id: string | null;
  provider_slug: string | null;
  provider_name: string | null;
  service_type: ServiceType;
  severity: Severity;
  status: Outage["status"];
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  description: string | null;
  reported_by: string | null;
  reported_at: Date;
  resolved_at: Date | null;
  estimated_restoration: Date | null;
  verification_count: number;
  is_verified: boolean;
  origin: "crowdsourced" | "official";
  source_name: string | null;
  customers_affected: number | null;
  start_known: boolean;
}

interface CommentRow {
  id: string;
  outage_id: string;
  user_id: string | null;
  comment: string;
  comment_type: OutageComment["commentType"];
  created_at: Date;
}

const COMMENT_COLUMNS = "id, outage_id, user_id, comment, comment_type, created_at";

function toOutage(row: SearchRow): Outage {
  return {
    id: row.id,
    // The app addresses providers by slug; the UUID stays server-side.
    providerId: row.provider_slug,
    providerName: row.provider_name,
    serviceType: row.service_type,
    severity: row.severity,
    status: row.status,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
    description: row.description,
    reportedBy: row.reported_by,
    reportedAt: iso(row.reported_at)!,
    resolvedAt: iso(row.resolved_at),
    estimatedRestoration: iso(row.estimated_restoration),
    verificationCount: row.verification_count ?? 0,
    isVerified: row.is_verified ?? false,
    origin: row.origin,
    sourceName: row.source_name,
    customersAffected: row.customers_affected,
    startKnown: row.start_known,
  };
}

function toComment(row: CommentRow, identity: string | null): OutageComment {
  return {
    id: row.id,
    outageId: row.outage_id,
    userId: row.user_id,
    authorLabel: identity !== null && row.user_id === identity ? "You" : "Neighbor",
    comment: row.comment,
    commentType: row.comment_type,
    createdAt: iso(row.created_at)!,
  };
}

/**
 * Every write is made as a real user. A cookie-only guest id (what identity
 * falls back to when no session could be created) has no users row, so the
 * write is refused with a reason instead of failing on the foreign key.
 */
function owner(identity: string): string {
  if (!isUuid(identity)) {
    throw new InvalidInputError("Reporting is unavailable right now: no guest session could be created.");
  }
  return identity;
}

/** Null when the write failed only because the outage does not exist. */
function missingOutage(error: unknown): null {
  if (pgCode(error) === PG.foreignKeyViolation) return null;
  throw error;
}

export class PostgresRepository implements Repository {
  readonly kind = "postgres" as const;

  /**
   * Slug -> UUID, needed because writes still reference the real key.
   *
   * Throws on an unknown slug rather than returning null. Silently dropping it
   * would store a report with no provider — which still shows on the map but
   * loses most of what makes it useful, and hides the mismatch that caused it.
   */
  private async providerUuid(slug: string | null): Promise<string | null> {
    if (!slug) return null;

    const [row] = await query<{ id: string }>(
      "SELECT id FROM providers WHERE slug = $1",
      [slug],
    );
    if (!row) {
      throw new InvalidInputError(`No provider called "${slug}".`, "providerId");
    }
    return row.id;
  }

  async listProviders(): Promise<Provider[]> {
    const rows = await query<{
      slug: string;
      name: string;
      service_type: ServiceType;
      logo_url: string | null;
      official_status_url: string | null;
    }>(
      "SELECT slug, name, service_type, logo_url, official_status_url FROM providers ORDER BY name",
    );

    return rows.map((r) => ({
      id: r.slug,
      name: r.name,
      serviceType: r.service_type,
      logoUrl: r.logo_url,
      officialStatusUrl: r.official_status_url,
    }));
  }

  async listAdvisories(bounds?: BoundingBox): Promise<Advisory[]> {
    const rows = await query<{
      id: string;
      source_name: string;
      source_id: string;
      kind: string;
      severity: Severity;
      headline: string | null;
      description: string | null;
      area_description: string | null;
      url: string | null;
      latitude: number;
      longitude: number;
      starts_at: Date | null;
      ends_at: Date | null;
    }>("SELECT * FROM search_advisories($1, $2, $3, $4, $5)", [
      bounds?.minLat ?? -90,
      bounds?.minLng ?? -180,
      bounds?.maxLat ?? 90,
      bounds?.maxLng ?? 180,
      300,
    ]);

    return rows.map((row) => ({
      id: row.id,
      sourceName: row.source_name,
      sourceId: row.source_id,
      kind: row.kind,
      severity: row.severity,
      headline: row.headline,
      description: row.description,
      areaDescription: row.area_description,
      url: row.url,
      latitude: row.latitude,
      longitude: row.longitude,
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
    }));
  }

  async listOutages(q: OutageQuery): Promise<Outage[]> {
    const bounds = q.bounds;
    const rows = await query<SearchRow>(
      `SELECT * FROM search_outages(
         min_lat => $1, min_lng => $2, max_lat => $3, max_lng => $4,
         service_types => $5, provider_slugs => $6, severities => $7,
         resolved_within_hours => $8, max_results => $9)`,
      [
        bounds?.minLat ?? -90,
        bounds?.minLng ?? -180,
        bounds?.maxLat ?? 90,
        bounds?.maxLng ?? 180,
        q.serviceTypes ?? null,
        q.providerIds && q.providerIds.length > 0 ? q.providerIds : null,
        q.severities ?? null,
        q.includeResolvedHours ?? 0,
        q.limit ?? 1000,
      ],
    );
    return rows.map(toOutage);
  }

  async getOutage(id: string, identity: string | null): Promise<OutageDetail | null> {
    if (!isUuid(id)) return null;

    const [rows, commentRows, mine] = await Promise.all([
      // outage_ids bypasses the viewport and status filters, so a resolved
      // outage opened from a link or a notification still loads.
      query<SearchRow>(
        "SELECT * FROM search_outages(outage_ids => ARRAY[$1]::uuid[], max_results => 1)",
        [id],
      ),
      query<CommentRow>(
        `SELECT ${COMMENT_COLUMNS} FROM outage_comments WHERE outage_id = $1 ORDER BY created_at`,
        [id],
      ),
      identity && isUuid(identity)
        ? query<{ id: string }>(
            "SELECT id FROM outage_confirmations WHERE outage_id = $1 AND user_id = $2",
            [id, identity],
          )
        : Promise.resolve([]),
    ]);

    const row = rows[0];
    if (!row) return null;

    return {
      ...toOutage(row),
      comments: commentRows.map((c) => toComment(c, identity)),
      confirmedByMe: mine.length > 0,
    };
  }

  async createOutage(input: CreateOutageInput, identity: string): Promise<Outage> {
    owner(identity);
    const providerUuid = await this.providerUuid(input.providerId);

    const id = await transaction(async (client) => {
      const {
        rows: [created],
      } = await client.query<{ id: string }>(
        `INSERT INTO outages (
           provider_id, service_type, severity, status, location,
           address, city, state, zip_code, description, reported_by,
           estimated_restoration, origin
         ) VALUES (
           $1, $2, $3, 'active', ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography,
           $6, $7, $8, $9, $10, $11, $12, 'crowdsourced'
         )
         RETURNING id`,
        [
          providerUuid,
          input.serviceType,
          input.severity,
          input.longitude,
          input.latitude,
          input.address ?? null,
          input.city ?? null,
          input.state ?? null,
          input.zipCode ?? null,
          input.description ?? null,
          identity,
          input.estimatedRestoration ?? null,
        ],
      );

      // The reporter implicitly confirms their own report, which also fires the
      // verification trigger and sets verification_count to 1.
      await client.query(
        "INSERT INTO outage_confirmations (outage_id, user_id) VALUES ($1, $2)",
        [created.id, identity],
      );
      return created.id;
    });

    const outage = await this.getOutage(id, identity);
    if (!outage) throw new Error("createOutage: row vanished after insert");
    return outage;
  }

  /** The trigger keeps verification_count equal to the confirmation count. */
  private async verificationCount(id: string): Promise<number | null> {
    const [row] = await query<{ verification_count: number | null }>(
      "SELECT verification_count FROM outages WHERE id = $1",
      [id],
    );
    return row ? (row.verification_count ?? 0) : null;
  }

  async confirmOutage(id: string, identity: string): Promise<number | null> {
    owner(identity);
    if (!isUuid(id)) return null;

    try {
      await query(
        `INSERT INTO outage_confirmations (outage_id, user_id) VALUES ($1, $2)
         ON CONFLICT (outage_id, user_id) DO NOTHING`,
        [id, identity],
      );
    } catch (error) {
      return missingOutage(error);
    }
    return this.verificationCount(id);
  }

  async unconfirmOutage(id: string, identity: string): Promise<number | null> {
    owner(identity);
    if (!isUuid(id)) return null;

    // Only the caller's own confirmation; anyone else's stays.
    await query(
      "DELETE FROM outage_confirmations WHERE outage_id = $1 AND user_id = $2",
      [id, identity],
    );
    return this.verificationCount(id);
  }

  async addComment(
    outageId: string,
    identity: string,
    comment: string,
    commentType: OutageComment["commentType"],
  ): Promise<OutageComment | null> {
    owner(identity);
    if (!isUuid(outageId)) return null;

    try {
      const [row] = await query<CommentRow>(
        `INSERT INTO outage_comments (outage_id, user_id, comment, comment_type)
         VALUES ($1, $2, $3, $4)
         RETURNING ${COMMENT_COLUMNS}`,
        [outageId, identity, comment, commentType],
      );
      return toComment(row, identity);
    } catch (error) {
      return missingOutage(error);
    }
  }

  async resolveOutage(id: string, identity: string): Promise<Outage | null> {
    owner(identity);
    if (!isUuid(id)) return null;

    // A vote, not a unilateral flip: apply_resolution_votes decides when enough
    // people agree to actually change the status.
    try {
      await transaction(async (client) => {
        await client.query(
          `INSERT INTO outage_resolutions (outage_id, user_id) VALUES ($1, $2)
           ON CONFLICT (outage_id, user_id) DO NOTHING`,
          [id, identity],
        );
        await client.query(
          `INSERT INTO outage_comments (outage_id, user_id, comment, comment_type)
           VALUES ($1, $2, 'Service is back for me.', 'resolution')`,
          [id, identity],
        );
      });
    } catch (error) {
      return missingOutage(error);
    }

    return this.getOutage(id, identity);
  }

  async getPreferences(identity: string): Promise<UserPreferences | null> {
    if (!isUuid(identity)) return null;
    const [row] = await query<{
      saved_providers: string[] | null;
      saved_locations: UserPreferences["savedLocations"] | null;
      notification_settings: Partial<UserPreferences["notifications"]> | null;
    }>(
      `SELECT saved_providers, saved_locations, notification_settings
       FROM user_preferences WHERE user_id = $1`,
      [identity],
    );
    if (!row) return null;

    return {
      ...DEFAULT_PREFERENCES,
      providerIds: row.saved_providers ?? [],
      savedLocations: row.saved_locations ?? [],
      notifications: {
        ...DEFAULT_PREFERENCES.notifications,
        ...(row.notification_settings ?? {}),
      },
    };
  }

  async savePreferences(
    identity: string,
    preferences: UserPreferences,
  ): Promise<UserPreferences> {
    owner(identity);
    // jsonb values go in as JSON text: pg would send a JS array as a Postgres
    // array literal, which jsonb rejects.
    await query(
      `INSERT INTO user_preferences (user_id, saved_providers, saved_locations, notification_settings)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET
         saved_providers = EXCLUDED.saved_providers,
         saved_locations = EXCLUDED.saved_locations,
         notification_settings = EXCLUDED.notification_settings`,
      [
        identity,
        preferences.providerIds,
        JSON.stringify(preferences.savedLocations),
        JSON.stringify(preferences.notifications),
      ],
    );
    return preferences;
  }
}
