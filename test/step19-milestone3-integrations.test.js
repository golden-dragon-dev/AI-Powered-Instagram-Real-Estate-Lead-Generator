import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { setupConversation } from "./helpers.js";
import { extractFactsFromMessage } from "../src/conversation/extract.js";
import {
  alertReasonFromTurn,
  shouldSendAdvisorAlert
} from "../src/conversation/intent-policy.js";
import { IntegrationOrchestrator } from "../src/integrations/orchestrator.js";
import { ProcessedEventStore } from "../src/integrations/processed-events.js";
import { AlertLedger } from "../src/integrations/whatsapp.js";
import { IntegrationLog } from "../src/integrations/integration-log.js";
import { buyerToHubSpotProperties } from "../src/integrations/hubspot.js";
import { verifySignature, parseInstagramMessages } from "../src/integrations/meta.js";

/**
 * Milestone 3 launch acceptance scenarios (mocked integrations).
 * Run: node --test test/step19-milestone3-integrations.test.js
 */

test("step 19a multi-field extraction still works", () => {
  const { facts } = extractFactsFromMessage("Budget AED 2M, Yas Island, 2 bedrooms, payment plan");
  assert.equal(facts.budget, 2_000_000);
  assert.equal(facts.area, "Yas Island");
  assert.equal(facts.bedrooms, 2);
  assert.equal(facts.financing, "payment_plan");
});

test("step 19b later preference correction updates buyer memory", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m3_1", "Budget AED 2M, Yas Island, studio");
  const changed = await engine.handleMessage("ig_m3_1", "What about masdar");
  assert.deepEqual(changed.buyer.preferredAreas, ["Masdar City"]);
  assert.doesNotMatch(changed.reply, /Yas Studio One/i);
});

test("step 19c informational EOI does not recommend an alert", async () => {
  const { engine } = await setupConversation();
  const result = await engine.handleMessage(
    "ig_m3_eoi",
    "Just interested for now, looking for information only"
  );
  assert.equal(result.alertRecommended, false);
  assert.ok(result.intents.includes("eoi_info") || result.signals.includes("informational_eoi"));
});

test("step 19d viewing request recommends a viewing alert", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m3_view", "Budget AED 2M, Yas, studio");
  const result = await engine.handleMessage("ig_m3_view", "Can I book a viewing?");
  assert.equal(result.alertRecommended, true);
  assert.equal(result.alertReason, "viewing_request");
  assert.ok(!result.intents.includes("reserve"));
  assert.ok(result.intents.includes("viewing"));
});

test("step 19e reservation request recommends a reservation alert", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m3_res", "Budget AED 2M, Yas, studio");
  const result = await engine.handleMessage("ig_m3_res", "I want to reserve this unit");
  assert.equal(result.alertRecommended, true);
  assert.equal(result.alertReason, "reservation_request");
});

test("step 19f agent request recommends an agent alert", async () => {
  const { engine } = await setupConversation();
  const result = await engine.handleMessage("ig_m3_agent", "Please speak to an advisor");
  assert.equal(result.alertRecommended, true);
  assert.equal(result.alertReason, "agent_request");
});

test("step 19g WhatsApp preference with no-call is preserved", async () => {
  const { engine } = await setupConversation();
  const result = await engine.handleMessage(
    "ig_m3_wa",
    "WhatsApp only please, no calls"
  );
  assert.equal(result.buyer.preferredContactChannel, "whatsapp");
  assert.equal(result.buyer.noCalls, true);
  assert.equal(result.buyer.contactDeclined, false);
  const props = buyerToHubSpotProperties(result.buyer);
  assert.equal(props.preferred_contact_channel, "whatsapp");
  assert.equal(props.no_calls, "true");
});

test("step 19h negative don't reserve suppresses alert", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m3_neg", "Budget AED 2M, Yas, studio");
  const result = await engine.handleMessage("ig_m3_neg", "Don't reserve anything yet");
  assert.equal(result.alertRecommended, false);
  assert.ok(result.intents.includes("decline_reserve"));
  assert.ok(!result.intents.includes("reserve"));
});

test("step 19i I'm good stops the sales path", async () => {
  const { engine } = await setupConversation();
  await engine.handleMessage("ig_m3_stop", "Budget AED 2M, Yas, studio");
  const stopped = await engine.handleMessage("ig_m3_stop", "I'm good");
  assert.equal(stopped.buyer.salesPathStopped, true);
  assert.equal(stopped.buyer.followUpStatus, "paused");
  assert.equal(stopped.alertRecommended, false);
  assert.match(stopped.reply, /pause/i);
});

test("step 19j Meta signature verification and message parsing", () => {
  const secret = "test_secret";
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "page1",
        messaging: [
          {
            sender: { id: "ig_user_9" },
            timestamp: 1,
            message: { mid: "mid_1", text: "Hello from Instagram" }
          },
          {
            sender: { id: "page1" },
            timestamp: 2,
            message: { mid: "mid_echo", text: "echo", is_echo: true }
          }
        ]
      }
    ]
  });
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifySignature(body, signature, { META_APP_SECRET: secret }), true);
  assert.equal(verifySignature(body, "sha256=deadbeef", { META_APP_SECRET: secret }), false);
  const events = parseInstagramMessages(JSON.parse(body));
  assert.equal(events.length, 1);
  assert.equal(events[0].senderId, "ig_user_9");
  assert.equal(events[0].mid, "mid_1");
});

test("step 19k duplicate webhook protection", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "m3-events-"));
  const events = new ProcessedEventStore({ rootDir });
  assert.equal(await events.claim("mid_dup", { senderId: "u1" }), true);
  assert.equal(await events.claim("mid_dup", { senderId: "u1" }), false);
  assert.equal(await events.has("mid_dup"), true);
});

test("step 19l HubSpot upsert is idempotent by Instagram user id", async () => {
  const { engine } = await setupConversation();
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "m3-orch-"));
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    if (String(url).includes("hubapi.com")) {
      return {
        ok: true,
        json: async () => ({ results: [{ id: "hs_123", new: calls.length === 1 }] })
      };
    }
    if (String(url).includes("graph.facebook.com") && String(url).includes("/messages") && !String(url).includes("whatsapp")) {
      return { ok: true, json: async () => ({ recipient_id: "ig_user", message_id: "out_1" }) };
    }
    return { ok: true, json: async () => ({ messages: [{ id: "wamid_1" }] }) };
  };
  const orchestrator = new IntegrationOrchestrator({
    engine,
    buyers: engine.buyers,
    rootDir,
    fetchImpl,
    env: {
      META_APP_SECRET: "secret",
      META_PAGE_ACCESS_TOKEN: "token",
      META_PAGE_ID: "page",
      HUBSPOT_ACCESS_TOKEN: "pat-test",
      WHATSAPP_ACCESS_TOKEN: "wa-token",
      WHATSAPP_PHONE_NUMBER_ID: "phone",
      WHATSAPP_ALERT_TO: "971500000000",
      WHATSAPP_TEMPLATE_NAME: "lead_alert"
    },
    log: new IntegrationLog({ rootDir }),
    events: new ProcessedEventStore({ rootDir }),
    alerts: new AlertLedger({ rootDir })
  });

  await engine.handleMessage("ig_hs_1", "Budget AED 2M, Yas, studio");
  const first = await orchestrator.processMessageEvent({
    mid: "mid_hs_1",
    senderId: "ig_hs_1",
    text: "I want to reserve this"
  });
  const second = await orchestrator.processMessageEvent({
    mid: "mid_hs_1",
    senderId: "ig_hs_1",
    text: "I want to reserve this"
  });

  assert.equal(second.duplicate, true);
  assert.equal(first.hubspot.contactId, "hs_123");
  const hubspotCalls = calls.filter((c) => c.url.includes("hubapi.com"));
  assert.equal(hubspotCalls.length, 1);
  assert.equal(hubspotCalls[0].body.inputs[0].idProperty, "instagram_user_id");
  assert.equal(hubspotCalls[0].body.inputs[0].id, "ig_hs_1");
});

test("step 19m failed integrations are logged without breaking memory", async () => {
  const { engine } = await setupConversation();
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "m3-fail-"));
  const log = new IntegrationLog({ rootDir });
  const fetchImpl = async (url) => {
    if (String(url).includes("hubapi.com")) {
      return { ok: false, status: 500, statusText: "Server Error", json: async () => ({ message: "boom" }) };
    }
    if (String(url).includes("/messages")) {
      return { ok: false, status: 500, statusText: "Send failed", json: async () => ({ error: { message: "send boom" } }) };
    }
    return { ok: false, status: 500, statusText: "wa fail", json: async () => ({ error: { message: "wa boom" } }) };
  };
  const orchestrator = new IntegrationOrchestrator({
    engine,
    buyers: engine.buyers,
    rootDir,
    fetchImpl,
    env: {
      META_PAGE_ACCESS_TOKEN: "token",
      META_PAGE_ID: "page",
      HUBSPOT_ACCESS_TOKEN: "pat-test",
      WHATSAPP_ACCESS_TOKEN: "wa-token",
      WHATSAPP_PHONE_NUMBER_ID: "phone",
      WHATSAPP_ALERT_TO: "971500000000",
      WHATSAPP_TEMPLATE_NAME: "lead_alert"
    },
    log,
    events: new ProcessedEventStore({ rootDir }),
    alerts: new AlertLedger({ rootDir })
  });

  await engine.handleMessage("ig_fail_1", "Budget AED 2M, Yas, studio");
  const outcome = await orchestrator.processMessageEvent({
    mid: "mid_fail_1",
    senderId: "ig_fail_1",
    text: "Please speak to an agent"
  });

  assert.equal(outcome.result.buyer.budgetAed, 2_000_000);
  assert.equal(outcome.result.alertRecommended, true);
  const errors = await log.list(20);
  assert.ok(errors.length >= 2);
  assert.ok(errors.every((row) => !/pat-test|wa-token|token/.test(JSON.stringify(row))));
});

test("step 19n alert reason helpers cover launch intents", () => {
  assert.equal(alertReasonFromTurn(["viewing"], ["viewing_request"]), "viewing_request");
  assert.equal(alertReasonFromTurn(["reserve"], ["reserve_interest"]), "reservation_request");
  assert.equal(alertReasonFromTurn(["agent"], ["agent_request"]), "agent_request");
  assert.equal(shouldSendAdvisorAlert({ intents: ["eoi_info"], signals: ["informational_eoi"] }), false);
});
