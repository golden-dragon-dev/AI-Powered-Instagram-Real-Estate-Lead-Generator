import { loadEnv } from "./load-env.js";
import { parseMoney, normalizeArea, normalizeBedrooms, normalizePropertyType } from "../src/matching/normalize.js";
import { createCatalogStore } from "../src/store/create-store.js";
import { PropertyService } from "../src/services/property-service.js";

loadEnv();

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1];
}

const store = await createCatalogStore();
const service = new PropertyService(store);
const result = service.answer({
  emirate: "Abu Dhabi",
  budgetAed: parseMoney(arg("budget")),
  cashAvailableAed: parseMoney(arg("cash")),
  area: normalizeArea(arg("area")),
  developer: arg("developer"),
  propertyType: normalizePropertyType(arg("type")),
  bedrooms: normalizeBedrooms(arg("bedrooms")),
  paymentPlanRequired: process.argv.includes("--payment-plan")
});

console.log(JSON.stringify({
  source: store.source || "local",
  matchCount: result.matchCount,
  matches: result.matches.map((row) => ({
    project: row.project.name,
    developer: row.project.developerName,
    area: row.project.area,
    bedrooms: row.bedroomLabel,
    price: row.unit.startingPriceAed,
    down: row.downPaymentAed
  })),
  reply: result.reply.text,
  handoffRequired: result.reply.handoffRequired
}, null, 2));
