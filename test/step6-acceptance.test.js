import assert from "node:assert/strict";
import test from "node:test";
import { setupServices } from "./helpers.js";

test("step 6a I have AED 3M, 500k now, Yas, 3BR, payment plan", async () => {
  const { buyers, properties } = await setupServices();
  const buyer = await buyers.remember("ig_accept_1", {
    budget: "AED 3M",
    cash: "500k",
    area: "Yas",
    bedrooms: "3 bedroom",
    financing: "payment_plan"
  });
  const full = properties.answer({
    emirate: buyer.preferredEmirate,
    budgetAed: buyer.budgetAed,
    cashAvailableAed: buyer.cashAvailableAed,
    area: buyer.preferredAreas[0],
    bedrooms: buyer.bedrooms[0],
    paymentPlanRequired: buyer.financing === "payment_plan"
  });
  assert.equal(full.matchCount, 1);
  assert.equal(full.matches[0].project.name, "Yas Park Views");
  assert.equal(full.check.ok, true);
  assert.equal(full.missingData.handoffRequired, false);
  assert.match(full.reply.text, /Yas Park Views/);
});

test("step 6b What can I buy in Hudayriyat", async () => {
  const { properties } = await setupServices();
  const full = properties.answer({ emirate: "Abu Dhabi", area: "Hudayriyat" });
  const names = full.matches.map((row) => row.project.name);
  assert.ok(names.includes("Hudayriyat Villas"));
  assert.ok(names.includes("Hudayriyat Shores"));
  assert.ok(full.matches.every((row) => row.project.area === "Hudayriyat Island"));
});

test("step 6c Anything from Aldar", async () => {
  const { properties } = await setupServices();
  const full = properties.answer({ emirate: "Abu Dhabi", developer: "Aldar" });
  assert.ok(full.matches.every((row) => row.project.developerName === "Aldar"));
  assert.ok(full.matches.some((row) => row.project.name === "Yas Park Views"));
  assert.ok(full.matches.some((row) => row.project.name === "Hudayriyat Shores"));
});

test("step 6d I want a studio", async () => {
  const { properties } = await setupServices();
  const full = properties.answer({ emirate: "Abu Dhabi", propertyType: "studio" });
  assert.ok(full.matches.length >= 1);
  assert.ok(full.matches.every((row) => row.unit.bedrooms === 0));
  assert.equal(full.matches.some((row) => row.project.name === "Yas Park Views"), false);
});

test("step 6e I want a villa", async () => {
  const { properties } = await setupServices();
  const full = properties.answer({ emirate: "Abu Dhabi", propertyType: "villa" });
  assert.ok(full.matches.every((row) => row.unit.propertyType === "villa"));
  assert.ok(full.matches.some((row) => row.project.area === "Hudayriyat Island"));
});

test("step 6f returning buyer is not asked for budget again", async () => {
  const { buyers } = await setupServices();
  await buyers.remember("ig_return", { budget: "3M", area: "Yas", bedrooms: 3 });
  const again = await buyers.getOrCreate("ig_return");
  const missing = buyers.missingQualificationFields(again);
  assert.equal(again.budgetAed, 3000000);
  assert.equal(missing.includes("budgetAed"), false);
  assert.equal(missing.includes("preferredAreas"), false);
});
