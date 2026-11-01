// Refuses to build for Cloudflare while any .env file is present. The
// OpenNext build copies every .env file into the deployed Worker, so an old
// .env.local holding credentials for another service would ship with it.
import { readdirSync } from "node:fs";

const found = readdirSync(".").filter((name) => /^\.env(\..+)?$/.test(name));
if (found.length > 0) {
  console.error(
    `Refusing to build: ${found.join(", ")} would be bundled into the Worker.\n` +
      "Move local settings to .secrets/dev.env (see dev.env.example) and delete the file.",
  );
  process.exit(1);
}
