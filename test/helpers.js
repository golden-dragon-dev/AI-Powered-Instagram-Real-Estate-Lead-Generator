import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { createLocalStore } from "../src/store/local-store.js";
import { BuyerService } from "../src/services/buyer-service.js";
import { PropertyService } from "../src/services/property-service.js";

export async function setupServices() {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "m1-buyers-"));
  const store = await createLocalStore({ runtimeDir });
  return {
    store,
    buyers: new BuyerService(store),
    properties: new PropertyService(store)
  };
}

export const YAS_3M_CRITERIA = {
  emirate: "Abu Dhabi",
  budgetAed: 3_000_000,
  cashAvailableAed: 500_000,
  area: "Yas Island",
  bedrooms: 3,
  paymentPlanRequired: true
};
