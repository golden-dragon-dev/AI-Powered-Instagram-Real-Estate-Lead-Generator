import assert from "node:assert/strict";
import test from "node:test";
import { setupServices, YAS_3M_CRITERIA } from "./helpers.js";

test("step 4a retrieved facts copy prices from the unit row only", async () => {
  const { properties } = await setupServices();
  const packs = properties.factsFor(properties.match(YAS_3M_CRITERIA));
  assert.equal(packs.length, 1);
  assert.equal(packs[0].startingPriceAed.value, 2600000);
  assert.equal(packs[0].startingPriceAed.confirmed, true);
  assert.equal(packs[0].downPaymentAed.value, 260000);
  assert.equal(packs[0].handover.value, "Q4 2027");
  assert.equal(packs[0].paymentPlanSummary.value.includes("80/20"), true);
});

test("step 4b missing commercial fields stay null and unconfirmed", async () => {
  const { properties } = await setupServices();
  const result = properties.match({
    emirate: "Abu Dhabi",
    area: "Yas Island",
    bedrooms: 3,
    developer: "Aldar"
  });
  const missing = result.matches.find((row) => row.project.name === "Yas Waterfront Residences");
  assert.ok(missing);
  const pack = properties.factsFor({ matches: [missing] })[0];
  assert.equal(pack.startingPriceAed.value, null);
  assert.equal(pack.startingPriceAed.confirmed, false);
  assert.equal(pack.downPaymentAed.confirmed, false);
  assert.equal(pack.handover.confirmed, false);
  assert.equal(pack.availability.confirmed, false);
  assert.equal(pack.paymentPlanSummary.confirmed, false);
});

test("step 4c fact pack never fills a blank price with another unit price", async () => {
  const { properties } = await setupServices();
  const result = properties.match({ emirate: "Abu Dhabi", area: "Yas Island" });
  const studio = result.matches.find((row) => row.project.name === "Yas Studio One" && row.unit.bedrooms === 0);
  const pack = properties.factsFor({ matches: [studio] })[0];
  assert.equal(pack.startingPriceAed.value, 850000);
  assert.notEqual(pack.startingPriceAed.value, 2600000);
});
