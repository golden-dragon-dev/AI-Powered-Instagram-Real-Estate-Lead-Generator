import assert from "node:assert/strict";
import test from "node:test";
import { setupServices } from "./helpers.js";
import { emptyBuyer } from "../src/schema/fields.js";
import { mergeBuyer } from "../src/services/buyer-service.js";

test("step 2a new Instagram user gets a buyer card", async () => {
  const { buyers } = await setupServices();
  const buyer = await buyers.getOrCreate("ig_1001");
  assert.equal(buyer.instagramUserId, "ig_1001");
  assert.equal(buyer.budgetAed, null);
  assert.equal(buyer.preferredEmirate, "Abu Dhabi");
  assert.equal(buyer.leadStatus, "new");
});

test("step 2b known facts are stored on the buyer card", async () => {
  const { buyers } = await setupServices();
  const buyer = await buyers.remember("ig_1002", {
    budget: "AED 3M",
    cash: "500k",
    area: "Yas",
    bedrooms: "3BR",
    financing: "payment_plan",
    developer: "Aldar"
  });
  assert.equal(buyer.budgetAed, 3000000);
  assert.equal(buyer.cashAvailableAed, 500000);
  assert.deepEqual(buyer.preferredAreas, ["Yas Island"]);
  assert.deepEqual(buyer.bedrooms, [3]);
  assert.equal(buyer.financing, "payment_plan");
  assert.equal(buyer.developerInterest, "Aldar");
});

test("step 2c later messages do not wipe earlier facts", async () => {
  const { buyers } = await setupServices();
  await buyers.remember("ig_1003", { budget: "3M", area: "Yas" });
  const buyer = await buyers.remember("ig_1003", { bedrooms: 3, cash: "500k" });
  assert.equal(buyer.budgetAed, 3000000);
  assert.deepEqual(buyer.preferredAreas, ["Yas Island"]);
  assert.deepEqual(buyer.bedrooms, [3]);
  assert.equal(buyer.cashAvailableAed, 500000);
});

test("step 2d returning Instagram user loads the same card", async () => {
  const { buyers, store } = await setupServices();
  await buyers.remember("ig_1004", { name: "Omar", budget: 3000000 });
  const again = store.getBuyer("ig_1004");
  assert.equal(again.name, "Omar");
  assert.equal(again.budgetAed, 3000000);
  const loaded = await buyers.getOrCreate("ig_1004");
  assert.equal(loaded.name, "Omar");
});

test("step 2e empty patch cannot clear stored contact fields", () => {
  const existing = mergeBuyer(emptyBuyer("ig_1005"), { name: "Sara", phone: "0501234567" });
  const merged = mergeBuyer(existing, { name: null, phone: "" });
  assert.equal(merged.name, "Sara");
  assert.equal(merged.phone, "0501234567");
});
