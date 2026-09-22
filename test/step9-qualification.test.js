import assert from "node:assert/strict";
import test from "node:test";
import { setupConversation } from "./helpers.js";
import { isCoreQualified, nextQualificationQuestion, qualificationGaps } from "../src/conversation/qualify.js";

test("step 9a progressive qualification asks budget first", async () => {
  const { engine } = await setupConversation();
  const result = await engine.handleMessage("ig_m2_q1", "Hi, I am looking in Abu Dhabi");
  assert.equal(result.stage, "qualifying");
  assert.match(result.reply, /budget/i);
  assert.ok(result.nextQuestion);
  assert.equal(result.nextQuestion.field, "budgetAed");
});

test("step 9b budget plus area becomes project-led", async () => {
  const { engine, buyers } = await setupConversation();
  await engine.handleMessage("ig_m2_q2", "My budget is AED 3M");
  let buyer = await buyers.getOrCreate("ig_m2_q2");
  assert.equal(buyer.budgetAed, 3000000);
  assert.ok(qualificationGaps(buyer).includes("preferredAreas"));

  const areaTurn = await engine.handleMessage("ig_m2_q2", "Yas Island please");
  buyer = areaTurn.buyer;
  assert.deepEqual(buyer.preferredAreas, ["Yas Island"]);
  assert.ok(["soft_match", "matched"].includes(areaTurn.stage));
  assert.ok(areaTurn.matchCount >= 1);
  assert.match(areaTurn.reply, /Yas Park Views/i);
  assert.doesNotMatch(areaTurn.reply, /I have noted/i);
  assert.ok(areaTurn.check.ok);
  assert.match(areaTurn.reply, /bedroom|BR|studio|size/i);

  const bedsTurn = await engine.handleMessage("ig_m2_q2", "3 bedroom apartment, payment plan, 500k cash");
  assert.equal(bedsTurn.buyer.bedrooms[0], 3);
  assert.equal(bedsTurn.buyer.cashAvailableAed, 500000);
  assert.equal(bedsTurn.buyer.financing, "payment_plan");
  assert.ok(isCoreQualified(bedsTurn.buyer));
  assert.ok(bedsTurn.matchCount >= 1);
  assert.equal(bedsTurn.matches[0].project.name, "Yas Park Views");
});

test("step 9c nextQualificationQuestion stays empty when complete", () => {
  const buyer = {
    budgetAed: 3_000_000,
    preferredAreas: ["Yas Island"],
    bedrooms: [3],
    propertyTypes: ["apartment"],
    cashAvailableAed: 500_000,
    financing: "payment_plan",
    name: "Omar",
    phone: "0501234567"
  };
  assert.equal(nextQualificationQuestion(buyer, { includeCash: true, includeFinancing: true, includeContact: true }), null);
});
