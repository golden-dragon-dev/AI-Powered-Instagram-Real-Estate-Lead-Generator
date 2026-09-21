import { createLocalStore } from "../src/store/local-store.js";

const store = await createLocalStore();
const snap = store.snapshot();
console.log(`Imported ${snap.developers.length} developers, ${snap.projects.length} projects, ${snap.units.length} units.`);
console.log("Local store is ready. Airtable can replace this later without changing matching code.");
