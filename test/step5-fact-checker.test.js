import assert from "node:assert/strict";
import test from "node:test";
import { setupServices, YAS_3M_CRITERIA } from "./helpers.js";
import { validateMessage, missingDataHandoff } from "../src/facts/checker.js";
import { renderSafeReply } from "../src/facts/safe-reply.js";

test("step 5a approved price in a reply is allowed", async () => {
  const { properties } = await setupServices();
  const packs = properties.factsFor(properties.match(YAS_3M_CRITERIA));
  const check = validateMessage(
    "Yas Park Views 3 bedroom starts from AED 2,600,000 with AED 260,000 initial.",
    packs
  );
  assert.equal(check.ok, true);
  assert.deepEqual(check.violations, []);
});

test("step 5b invented price is blocked", async () => {
  const { properties } = await setupServices();
  const packs = properties.factsFor(properties.match(YAS_3M_CRITERIA));
  const check = validateMessage("Yas Park Views starts from AED 2,100,000.", packs);
  assert.equal(check.ok, false);
  assert.ok(check.violations.some((row) => row.type === "amount"));
});

test("step 5c invented handover date is blocked", async () => {
  const { properties } = await setupServices();
  const packs = properties.factsFor(properties.match(YAS_3M_CRITERIA));
  const check = validateMessage("Handover is Q1 2025.", packs);
  assert.equal(check.ok, false);
  assert.ok(check.violations.some((row) => row.type === "date"));
});

test("step 5d generated safe reply always passes the checker", async () => {
  const { properties } = await setupServices();
  const packs = properties.factsFor(properties.match(YAS_3M_CRITERIA));
  const reply = renderSafeReply(packs);
  const check = validateMessage(reply.text, packs);
  assert.equal(check.ok, true);
  assert.equal(reply.handoffRequired, false);
  assert.match(reply.text, /AED 2,600,000/);
});

test("step 5e missing data does not request a human handoff", async () => {
  const { properties } = await setupServices();
  const result = properties.match({
    emirate: "Abu Dhabi",
    area: "Yas Island",
    bedrooms: 3,
    developer: "Aldar"
  });
  const missing = result.matches.find((row) => row.project.name === "Yas Waterfront Residences");
  const packs = properties.factsFor({ matches: [missing] });
  const reply = renderSafeReply(packs);
  const check = validateMessage(reply.text, packs);
  const handoff = missingDataHandoff(packs);
  assert.equal(check.ok, true);
  assert.equal(handoff.handoffRequired, false);
  assert.equal(reply.handoffRequired, false);
  assert.match(reply.text, /not confirmed yet/);
});

test("step 5f empty match list still does not handoff", async () => {
  const { properties } = await setupServices();
  const answer = properties.answer({
    emirate: "Abu Dhabi",
    area: "Yas Island",
    bedrooms: 5,
    budgetAed: 500000
  });
  assert.equal(answer.matchCount, 0);
  assert.equal(answer.reply.handoffRequired, false);
  assert.match(answer.reply.text, /do not have a confirmed match/i);
});
