import assert from "node:assert/strict";
import test from "node:test";
import { extractFactsFromMessage, detectIntents } from "../src/conversation/extract.js";

test("step 8a natural Yas budget line extracts facts", () => {
  const { facts, intents } = extractFactsFromMessage(
    "Hi, I have AED 3M budget for Yas, looking at a 3 bedroom with payment plan"
  );
  assert.equal(facts.budget, 3000000);
  assert.equal(facts.area, "Yas Island");
  assert.equal(facts.bedrooms, 3);
  assert.equal(facts.financing, "payment_plan");
  assert.ok(intents.includes("greet"));
  assert.ok(intents.includes("provide_facts"));
});

test("step 8b cash and studio extract correctly", () => {
  const { facts } = extractFactsFromMessage("I can put 500k cash now on a studio apartment");
  assert.equal(facts.cash, 500000);
  assert.equal(facts.bedrooms, 0);
  assert.equal(facts.propertyType, "studio");
});

test("step 8c high intent reserve is flagged", () => {
  const { intents, signals } = extractFactsFromMessage("I want to reserve Yas Park Views");
  assert.ok(intents.includes("reserve"));
  assert.ok(intents.includes("high_intent"));
  assert.ok(signals.includes("reserve_interest"));
  assert.equal(extractFactsFromMessage("I want to reserve Yas Park Views").facts.project, "Yas Park Views");
});

test("step 8d detectIntents marks agent request", () => {
  const intents = detectIntents("Can I speak to an agent please");
  assert.ok(intents.includes("agent"));
  assert.ok(intents.includes("high_intent"));
});
