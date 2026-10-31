// Starts `next dev` with local settings from .secrets/dev.env when it exists.
// That file is not a .env file on purpose: the Cloudflare build copies every
// .env file it finds into the deployed Worker. Without it the app runs on the
// seeded in-memory store.
import { existsSync } from "node:fs";

if (existsSync(".secrets/dev.env")) process.loadEnvFile(".secrets/dev.env");
process.argv.splice(2, 0, "dev", ...process.argv.splice(2));
await import("next/dist/bin/next");
