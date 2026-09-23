import assert from "node:assert/strict";
import test from "node:test";
import { setupConversation } from "./helpers.js";
import { extractFactsFromMessage } from "../src/conversation/extract.js";
import { explainSoftMismatches } from "../src/conversation/match-resolve.js";
import { criteriaFromBuyer, matchInventory } from "../src/matching/matcher.js";

/**
 * Codex step-by-step checks for client screenshot bugs.
 * Run: node --test test/step16-client-corrections.test.js
 */

test("step 16a extract: Forget Yas / What about Reem replaces area", () => {
  const { facts } = extractFactsFromMessage("Forget Yas actually. What about Reem?");
  assert.equal(facts.area, "Al Reem Island");
  assert.notEqual(facts.area, "Yas Island");
});

test("step 16b extract: 1 or 2 bed keeps both sizes", () => {
  const { facts } = extractFactsFromMessage("Maybe a 1 or 2 bed. What would you recommend?");
  assert.deepEqual(facts.bedrooms, [1, 2]);
});

test("step 16c extract: no more than 150k down stores cash ceiling", () => {
  const { facts } = extractFactsFromMessage("I don't want to put more than 150k down.");
  assert.equal(facts.cash, 150_000);
});

test("step 16d extract: actually make the budget 2m updates budget", () => {
  const { facts } = extractFactsFromMessage("Actually let’s make the budget 2m.");
  assert.equal(facts.budget, 2_000_000);
});

test("step 16e conversation: Forget Yas switches matches off Yas", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m2_c1", "Budget AED 2M, Yas Island, 1 bedroom");
  const switched = await engine.handleMessage(
    "ig_m2_c1",
    "Forget Yas actually. What about Reem?"
  );
  assert.deepEqual(switched.buyer.preferredAreas, ["Al Reem Island"]);
  assert.doesNotMatch(switched.reply, /on Yas Island/i);
  assert.match(switched.reply, /Reem|Al Reem|do not have a confirmed option|nearby/i);
  for (const row of switched.matches) {
    assert.match(row.project.area, /Reem/i);
  }
});

test("step 16f conversation: 1 or 2 bed does not claim only 2 bedroom", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m2_c2", "Budget AED 1.5M, Yas");
  const result = await engine.handleMessage(
    "ig_m2_c2",
    "Maybe a 1 or 2 bed. What would you recommend?"
  );
  assert.deepEqual(result.buyer.bedrooms, [1, 2]);
  assert.doesNotMatch(result.reply, /You asked for 2 bedroom/i);
  if (/not an exact match|You asked for/i.test(result.reply)) {
    assert.match(result.reply, /1 bedroom|1 or 2/i);
  }
});

test("step 16g conversation: budget change while cash pending does not repeat cash ask", async () => {
  const { engine } = await setupConversation();
  const first = await engine.handleMessage("ig_m2_c3", "AED 3M, Yas Island");
  assert.match(first.reply, /cash|initial payment|bedroom|BR|size/i);
  // Force cash pending path: set beds then get cash ask
  await engine.handleMessage("ig_m2_c3", "2 bedrooms");
  const cashAsk = await engine.handleMessage("ig_m2_c3", "payment plan");
  // If cash was asked, divert with budget change
  const diverted = await engine.handleMessage(
    "ig_m2_c3",
    "Actually let’s make the budget 2m."
  );
  assert.equal(diverted.buyer.budgetAed, 2_000_000);
  assert.doesNotMatch(
    diverted.reply,
    /How much cash can you put in for the initial payment\?/i
  );
});

test("step 16h conversation: 150k down filters initial payment", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m2_c4", "Budget AED 2M, Yas, 1 bedroom");
  const result = await engine.handleMessage(
    "ig_m2_c4",
    "I don't want to put more than 150k down."
  );
  assert.equal(result.buyer.cashAvailableAed, 150_000);
  for (const row of result.matches) {
    assert.ok(row.downPaymentAed <= 150_000);
  }
});

test("step 16i matcher: bedrooms array matches either size", async () => {
  const { properties } = await setupConversation();
  const buyer = {
    preferredEmirate: "Abu Dhabi",
    preferredAreas: ["Yas Island"],
    bedrooms: [1, 2],
    budgetAed: 2_000_000,
    cashAvailableAed: null,
    financing: "unknown"
  };
  const result = matchInventory(properties.catalog(), criteriaFromBuyer(buyer));
  assert.ok(result.matchCount >= 1);
  assert.ok(result.matches.every((row) => [1, 2].includes(row.unit.bedrooms)));
});

test("step 16j soft mismatch: multi bed wording uses 1 or 2", () => {
  const notes = explainSoftMismatches(
    { bedrooms: [1, 2], preferredAreas: ["Yas Island"], budgetAed: 1_500_000 },
    [
      {
        project: { name: "Yas Studio One", area: "Yas Island", paymentPlanAvailable: true },
        unit: { bedrooms: 0, startingPriceAed: 850_000 },
        downPaymentAed: 85_000
      }
    ],
    "without_bedrooms",
    ["bedrooms"]
  );
  assert.ok(notes.some((n) => /1 bedroom or 2 bedroom/i.test(n)));
  assert.ok(!notes.some((n) => /^You asked for 2 bedroom\./i.test(n)));
});
