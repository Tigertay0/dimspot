import type {
  Advisory,
  BoundingBox,
  CreateOutageInput,
  Outage,
  OutageComment,
  OutageDetail,
  OutageQuery,
  Provider,
  UserPreferences,
} from "@/lib/types";

/**
 * The storage contract every backend must satisfy.
 *
 * Two implementations exist:
 *   - PostgresRepository — Postgres + PostGIS, used when a database is configured.
 *   - LocalRepository    — in-process seeded store, so the app runs with no setup.
 *
 * `identity` is whoever is acting: a user id (anonymous or signed in) from the
 * session, or — with no database — an anonymous per-browser id issued by the
 * guest cookie. It always comes from the server's view of the session, never
 * from the request, and every write is scoped to it.
 */
export interface Repository {
  readonly kind: "postgres" | "local";

  listProviders(): Promise<Provider[]>;

  listOutages(query: OutageQuery): Promise<Outage[]>;

  /** Hazard advisories in view — weather warnings and the like. */
  listAdvisories(bounds?: BoundingBox): Promise<Advisory[]>;

  getOutage(id: string, identity: string | null): Promise<OutageDetail | null>;

  /**
   * An active report of the same service within a block or so, filed in the
   * last few hours: the id of the outage a new report here would duplicate.
   * The route confirms that one instead of adding a second pin.
   */
  findNearbyReport(
    input: Pick<CreateOutageInput, "serviceType" | "latitude" | "longitude">,
  ): Promise<string | null>;

  /**
   * `network` is where the request came from (lib/client-address.ts
   * voteNetwork): confirmations and "it's back" votes are counted by distinct
   * network, because guest identities are free to mint.
   */
  createOutage(
    input: CreateOutageInput,
    identity: string,
    network?: string | null,
  ): Promise<Outage>;

  /** Returns the new confirmation count, or null if the outage is gone. */
  confirmOutage(id: string, identity: string, network?: string | null): Promise<number | null>;

  unconfirmOutage(id: string, identity: string): Promise<number | null>;

  addComment(
    outageId: string,
    identity: string,
    comment: string,
    commentType: OutageComment["commentType"],
  ): Promise<OutageComment | null>;

  /**
   * Records an "it's back" vote; the outage resolves once enough distinct
   * networks agree. Throws InvalidInputError for an official outage, which
   * only its own feed closes.
   */
  resolveOutage(id: string, identity: string, network?: string | null): Promise<Outage | null>;

  getPreferences(identity: string): Promise<UserPreferences | null>;

  savePreferences(
    identity: string,
    preferences: UserPreferences,
  ): Promise<UserPreferences>;
}

/**
 * The caller sent something the backend cannot accept — an unknown provider,
 * say. Distinct from a genuine failure so the API layer can answer 400 instead
 * of 500: the request is wrong, not the server.
 */
export class InvalidInputError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "InvalidInputError";
  }
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  serviceTypes: ["power", "internet", "cellular", "other"],
  providerIds: [],
  severities: ["complete", "degraded", "intermittent"],
  savedLocations: [],
  notifications: {
    enabled: false,
    severityThreshold: "complete",
    radiusMiles: 5,
    quietHoursStart: null,
    quietHoursEnd: null,
  },
  defaultCenter: null,
  home: null,
  myProviders: {},
};
