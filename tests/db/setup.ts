import { existsSync } from "node:fs";

// The app reads its database and auth settings from process.env outside a
// Worker; load the local ones unless the environment already has them.
if (!process.env.DATABASE_URL && existsSync(".secrets/dev.env")) {
  process.loadEnvFile(".secrets/dev.env");
}
if (!process.env.DATABASE_URL) {
  throw new Error("Set DATABASE_URL (the Neon dev branch) to run the database tests.");
}
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
