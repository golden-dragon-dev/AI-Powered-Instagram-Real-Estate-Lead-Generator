#!/usr/bin/env node
import { loadEnv } from "./load-env.js";
import { ensureHubSpotProperties } from "../src/integrations/hubspot.js";

loadEnv();

try {
  const result = await ensureHubSpotProperties();
  if (result.skipped) {
    console.log("HubSpot skipped: HUBSPOT_ACCESS_TOKEN is not set.");
    process.exit(0);
  }
  console.log(`HubSpot properties ready. Existing: ${result.existing.length}. Created: ${result.created.length}.`);
  if (result.created.length) console.log(`Created: ${result.created.join(", ")}`);
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
