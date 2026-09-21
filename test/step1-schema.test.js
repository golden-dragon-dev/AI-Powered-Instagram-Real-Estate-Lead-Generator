import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog, validateProject } from "../src/schema/validate.js";
import { DEVELOPER_FIELDS, PROJECT_FIELDS, UNIT_FIELDS, BUYER_FIELDS } from "../src/schema/fields.js";
import { createLocalStore } from "../src/store/local-store.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadSeed() {
  const read = (name) => readFile(path.join(ROOT, "data", "seed", name), "utf8").then(JSON.parse);
  return {
    developers: await read("developers.json"),
    projects: await read("projects.json"),
    units: await read("units.json")
  };
}

test("step 1a Airtable field lists exist for developers projects and units", () => {
  assert.ok(DEVELOPER_FIELDS.find((field) => field.name === "Name"));
  assert.ok(PROJECT_FIELDS.find((field) => field.name === "Starting price AED") === undefined);
  assert.ok(PROJECT_FIELDS.find((field) => field.name === "Source"));
  assert.ok(PROJECT_FIELDS.find((field) => field.name === "Last verified"));
  assert.ok(PROJECT_FIELDS.find((field) => field.name === "Active"));
  assert.ok(UNIT_FIELDS.find((field) => field.name === "Starting price AED"));
  assert.ok(UNIT_FIELDS.find((field) => field.name === "Bedrooms"));
  assert.ok(BUYER_FIELDS.includes("instagramUserId"));
  assert.ok(BUYER_FIELDS.includes("budgetAed"));
  assert.ok(BUYER_FIELDS.includes("cashAvailableAed"));
});

test("step 1b seed catalog passes validation", async () => {
  const seed = await loadSeed();
  assert.deepEqual(validateCatalog(seed), []);
});

test("step 1c active projects require source and last verified", async () => {
  const seed = await loadSeed();
  const broken = { ...seed.projects[0], source: null, lastVerified: null, active: true };
  const errors = validateProject(broken, seed.developers, "broken");
  assert.ok(errors.some((row) => row.includes("source")));
  assert.ok(errors.some((row) => row.includes("lastVerified")));
});

test("step 1d local store hides inactive projects", async () => {
  const store = await createLocalStore({ runtimeDir: path.join(ROOT, "data", "runtime", "step1") });
  const names = store.listProjects().map((row) => row.name);
  assert.ok(names.includes("Yas Park Views"));
  assert.equal(names.includes("Old Yas Towers"), false);
  const allNames = store.listProjects({ includeInactive: true }).map((row) => row.name);
  assert.ok(allNames.includes("Old Yas Towers"));
});

test("step 1e studio units cannot be stored as 3 bedroom", async () => {
  const seed = await loadSeed();
  const errors = validateCatalog({
    ...seed,
    units: [
      ...seed.units,
      {
        id: "bad_studio",
        projectId: "prj_yas_park_views",
        propertyType: "studio",
        bedrooms: 3,
        startingPriceAed: 1000000,
        sizeSqftFrom: 400,
        sizeSqftTo: 400,
        initialPaymentAed: 100000,
        availability: "Available",
        active: true
      }
    ]
  });
  assert.ok(errors.some((row) => row.includes("studio units must have 0 bedrooms")));
});
