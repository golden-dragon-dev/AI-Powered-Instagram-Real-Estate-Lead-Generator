import assert from "node:assert/strict";
import test from "node:test";
import { setupConversation } from "./helpers.js";
import { understandMessageLocally, mergeUnderstanding } from "../src/conversation/understand.js";
import { extractFactsFromMessage } from "../src/conversation/extract.js";

test("step 15a not sure on budget offers ranges instead of repeating", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m2_u1", "Hi");
  const unsure = await engine.handleMessage("ig_m2_u1", "Not sure");
  assert.equal(unsure.stage, "qualifying");
  assert.match(unsure.reply, /range|No problem/i);
  assert.doesNotMatch(unsure.reply, /^What budget are you working with\?$/m);
  assert.ok(unsure.nextQuestion?.choices?.length >= 3);
  assert.ok(unsure.unsure?.includes("budget") || unsure.intents.includes("unsure"));
});

test("step 15b around 2M sets budget", async () => {
  const { engine } = await setupConversation();
  const result = await engine.handleMessage("ig_m2_u2", "around 2M");
  assert.equal(result.buyer.budgetAed, 2_000_000);
  assert.match(result.reply, /area|Yas|budget|doors|look/i);
});

test("step 15c maybe Yas but open to other areas", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m2_u3", "around 2M");
  const result = await engine.handleMessage(
    "ig_m2_u3",
    "maybe Yas but open to other areas"
  );
  assert.ok(result.buyer.preferredAreas?.some((a) => /Yas/i.test(a)));
  assert.ok(
    result.buyer.openToOtherAreas ||
      result.buyer.intentSignals?.includes("area_flexible") ||
      result.signals?.includes("area_flexible")
  );
  assert.ok(result.matchCount >= 1);
});

test("step 15d actually make that 2 bedrooms replaces prior size", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m2_u4", "Budget AED 3M, Yas, 3 bedroom");
  const result = await engine.handleMessage("ig_m2_u4", "actually make that 2 bedrooms");
  assert.deepEqual(result.buyer.bedrooms, [2]);
});

test("step 15e put down about 300k stores cash", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m2_u5", "AED 3M Yas");
  const result = await engine.handleMessage("ig_m2_u5", "I can put down about 300k");
  assert.equal(result.buyer.cashAvailableAed, 300_000);
});

test("step 15f local understand merges with regex extract", () => {
  const base = extractFactsFromMessage("actually make that 2 bedrooms");
  const local = understandMessageLocally("not sure", { lastAskedField: "budgetAed" });
  assert.ok(local.unsure.includes("budget"));
  const merged = mergeUnderstanding(base, local);
  assert.ok(merged.intents.includes("unsure"));
  assert.equal(merged.facts.bedrooms, 2);
});
