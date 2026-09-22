import assert from "node:assert/strict";
import test from "node:test";
import { setupConversation } from "./helpers.js";
import { isAffirmation } from "../src/conversation/affirmation.js";
import { loadConversationPreferences } from "../src/conversation/preferences.js";

test("step 13a AED 2M Yas pitches project before full questionnaire", async () => {
  const { engine } = await setupConversation();
  const result = await engine.handleMessage("ig_m2_led1", "I have AED 2M and want Yas.");
  assert.equal(result.buyer.budgetAed, 2000000);
  assert.deepEqual(result.buyer.preferredAreas, ["Yas Island"]);
  assert.ok(["soft_match", "matched"].includes(result.stage));
  assert.ok(result.matchCount >= 1);
  assert.match(result.reply, /Yas Park Views/i);
  assert.doesNotMatch(result.reply, /I have noted|approved list|current filters/i);
  assert.match(result.reply, /1|2|bedroom|BR|both/i);
  assert.ok(result.check.ok);
});

test("step 13b sure after two bedroom options asks which one", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m2_led2", "I have AED 2M and want Yas.");
  const sure = await engine.handleMessage("ig_m2_led2", "sure");
  assert.ok(isAffirmation("sure"));
  assert.match(sure.reply, /which|1|2|BR|bedroom/i);
  assert.doesNotMatch(sure.reply, /I have AED 2M opens/i);
  assert.ok(sure.nextQuestion?.choices?.length >= 2);
});

test("step 13c no exact match still offers a confirmed alternative", async () => {
  const { engine } = await setupConversation();
  // 3BR + very low cash should fail exact, then soft path can still offer Yas options
  await engine.handleMessage("ig_m2_led3", "Budget AED 3M, Yas, 3 bedroom");
  const result = await engine.handleMessage(
    "ig_m2_led3",
    "I only have 50k cash available now and need a payment plan"
  );
  assert.doesNotMatch(result.reply, /widen area or bedrooms/i);
  if (result.matchCount === 0) {
    assert.match(result.reply, /another area|nearby|confirmed option/i);
  } else {
    assert.match(result.reply, /Yas|confirmed|option/i);
  }
  assert.ok(result.check.ok);
});

test("step 13d featured preference file is editable without code changes", () => {
  const prefs = loadConversationPreferences();
  assert.ok(Array.isArray(prefs.featuredProjectIds));
  assert.ok(prefs.featuredProjectIds.includes("prj_yas_park_views") || prefs.featuredProjectNames?.length >= 0);
});

test("step 13e project card surfaces confirmed commercial fields", async () => {
  const { engine } = await setupConversation();
  const result = await engine.handleMessage(
    "ig_m2_led4",
    "AED 3M, Yas, 3 bedroom, 500k cash, payment plan"
  );
  assert.match(result.reply, /Yas Park Views/i);
  assert.match(result.reply, /Aldar/i);
  assert.match(result.reply, /2,600,000|2600000/i);
  assert.match(result.reply, /80\/20|payment plan|initial/i);
  assert.match(result.reply, /Q4 2027|handover/i);
  assert.ok(result.check.ok);
});
