import assert from "node:assert/strict";
import test from "node:test";
import { setupServices, YAS_3M_CRITERIA } from "./helpers.js";

function names(result) {
  return result.matches.map((row) => row.project.name);
}

test("step 3a Yas 3M 500k cash 3BR payment plan matches only Yas Park Views 3 bedroom", async () => {
  const { properties } = await setupServices();
  const result = properties.match(YAS_3M_CRITERIA);
  assert.equal(result.matchCount, 1);
  assert.equal(result.matches[0].project.name, "Yas Park Views");
  assert.equal(result.matches[0].unit.bedrooms, 3);
  assert.equal(result.matches[0].unit.startingPriceAed, 2600000);
  assert.equal(result.matches[0].downPaymentAed, 260000);
});

test("step 3b Yas Park Views is not recommended as a studio", async () => {
  const { properties } = await setupServices();
  const result = properties.match({
    emirate: "Abu Dhabi",
    area: "Yas Island",
    propertyType: "studio"
  });
  assert.ok(names(result).includes("Yas Studio One"));
  assert.equal(names(result).includes("Yas Park Views"), false);
  assert.ok(result.matches.every((row) => row.unit.bedrooms === 0));
});

test("step 3c missing price cannot enter a budget match", async () => {
  const { properties } = await setupServices();
  const result = properties.match(YAS_3M_CRITERIA);
  assert.equal(names(result).includes("Yas Waterfront Residences"), false);
  assert.ok(result.rejected.some((row) => row.reason === "price_unconfirmed" && row.projectName === "Yas Waterfront Residences"));
});

test("step 3d 800k initial payment fails 500k cash", async () => {
  const { properties } = await setupServices();
  const result = properties.match(YAS_3M_CRITERIA);
  assert.equal(names(result).includes("Yas Grove Residences"), false);
  assert.ok(result.rejected.some((row) => row.reason === "initial_payment" && row.projectName === "Yas Grove Residences"));
});

test("step 3e inactive Old Yas Towers never matches", async () => {
  const { properties } = await setupServices();
  const result = properties.match({
    emirate: "Abu Dhabi",
    area: "Yas Island",
    bedrooms: 3,
    budgetAed: 3000000
  });
  assert.equal(names(result).includes("Old Yas Towers"), false);
});

test("step 3f Hudayriyat villa query stays on villas", async () => {
  const { properties } = await setupServices();
  const result = properties.match({
    emirate: "Abu Dhabi",
    area: "Hudayriyat",
    propertyType: "villa"
  });
  assert.ok(result.matchCount >= 1);
  assert.ok(result.matches.every((row) => row.project.area === "Hudayriyat Island"));
  assert.ok(result.matches.every((row) => row.unit.propertyType === "villa"));
  assert.equal(names(result).includes("Hudayriyat Shores"), false);
});

test("step 3g Aldar filter excludes Modon", async () => {
  const { properties } = await setupServices();
  const result = properties.match({
    emirate: "Abu Dhabi",
    developer: "Aldar"
  });
  assert.ok(result.matchCount > 0);
  assert.ok(result.matches.every((row) => row.project.developerName === "Aldar"));
  assert.equal(names(result).includes("Hudayriyat Villas"), false);
  assert.equal(names(result).includes("Yas Grove Residences"), false);
});

test("step 3h payment plan filter excludes Reem Gate", async () => {
  const { properties } = await setupServices();
  const result = properties.match({
    emirate: "Abu Dhabi",
    area: "Al Reem Island",
    paymentPlanRequired: true
  });
  assert.equal(result.matchCount, 0);
  assert.ok(result.rejected.some((row) => row.reason === "payment_plan"));
});

test("step 3i buyer card drives matching", async () => {
  const { buyers, properties } = await setupServices();
  const buyer = await buyers.remember("ig_match", {
    budget: "3M",
    cash: "500k",
    area: "Yas Island",
    bedrooms: 3,
    financing: "payment_plan"
  });
  const result = properties.matchBuyer(buyer);
  assert.equal(result.matchCount, 1);
  assert.equal(result.matches[0].project.name, "Yas Park Views");
});
