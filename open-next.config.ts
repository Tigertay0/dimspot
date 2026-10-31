import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every response is rendered per request (the map is client-side and the API
// is dynamic), so no incremental cache is needed.
export default defineCloudflareConfig({});
