import { IntegrationLog } from "./integration-log.js";
import { ProcessedEventStore } from "./processed-events.js";
import { AlertLedger, sendWhatsAppAlert } from "./whatsapp.js";
import { upsertHubSpotContact } from "./hubspot.js";
import { parseInstagramMessages, sendInstagramText, verifySignature, verifyWebhookChallenge } from "./meta.js";
import { runtimeRoot } from "./json-store.js";

/**
 * Milestone 3 orchestrator: webhook -> engine -> HubSpot -> IG reply -> WhatsApp alert.
 * Integration failures are isolated and logged; buyer memory from the engine stays intact.
 */
export class IntegrationOrchestrator {
  constructor({
    engine,
    buyers,
    env = process.env,
    fetchImpl = fetch,
    rootDir = null,
    log = null,
    events = null,
    alerts = null
  } = {}) {
    if (!engine) throw new Error("IntegrationOrchestrator requires engine");
    this.engine = engine;
    this.buyers = buyers;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.rootDir = rootDir || runtimeRoot(env);
    this.log = log || new IntegrationLog({ rootDir: this.rootDir });
    this.events = events || new ProcessedEventStore({ rootDir: this.rootDir });
    this.alerts = alerts || new AlertLedger({ rootDir: this.rootDir });
    this.queue = Promise.resolve();
  }

  handleVerify(query) {
    return verifyWebhookChallenge(query, this.env);
  }

  async handleWebhook({ rawBody, signatureHeader }) {
    if (!verifySignature(rawBody, signatureHeader, this.env)) {
      return { ok: false, status: 403, error: "invalid_signature" };
    }
    let payload;
    try {
      payload = JSON.parse(String(rawBody || "{}"));
    } catch {
      return { ok: false, status: 400, error: "invalid_json" };
    }

    const messages = parseInstagramMessages(payload);
    // Acknowledge Meta quickly; process asynchronously on a single queue.
    this.queue = this.queue.then(() => this.#processMessages(messages)).catch(async (error) => {
      await this.log.record({
        integration: "orchestrator",
        operation: "queue",
        status: "error",
        message: error.message,
        retryable: false
      });
    });

    return { ok: true, status: 200, accepted: messages.length };
  }

  async processMessageEvent(event, options = {}) {
    const mid = event.mid;
    const claimed = await this.events.claim(mid, {
      senderId: event.senderId,
      text: String(event.text || "").slice(0, 120)
    });
    if (!claimed) {
      return { duplicate: true, mid };
    }

    try {
      const result = await this.engine.handleMessage(event.senderId, event.text, {
        useLlm: options.useLlm
      });

      const hubspot = await this.#safeHubSpot(result, event);
      const send = await this.#safeInstagramSend(event.senderId, result.reply, mid);
      const alert = await this.#safeWhatsAppAlert(result, event);

      await this.events.complete(mid, {
        hubspotContactId: hubspot.contactId || null,
        outboundMessageId: send.messageId || null,
        alertKey: alert.key || null
      });

      return {
        duplicate: false,
        mid,
        result,
        hubspot,
        send,
        alert
      };
    } catch (error) {
      await this.events.fail(mid, { message: error.message });
      await this.log.record({
        correlationId: mid,
        integration: "orchestrator",
        operation: "processMessageEvent",
        status: "error",
        message: error.message,
        retryable: Boolean(error.retryable),
        meta: { senderId: event.senderId }
      });
      throw error;
    }
  }

  async #processMessages(messages) {
    const outputs = [];
    for (const event of messages) {
      outputs.push(await this.processMessageEvent(event));
    }
    return outputs;
  }

  async #safeHubSpot(result, event) {
    try {
      const sync = await upsertHubSpotContact({
        buyer: result.buyer,
        matches: result.matches,
        lastMessage: event.text,
        alertReason: result.alertReason,
        env: this.env,
        fetchImpl: this.fetchImpl
      });
      if (sync.contactId && this.buyers?.patchBuyer) {
        await this.buyers.patchBuyer(result.buyer.instagramUserId, {
          hubspotContactId: sync.contactId
        });
      }
      return sync;
    } catch (error) {
      await this.log.record({
        correlationId: event.mid,
        integration: "hubspot",
        operation: "upsert",
        status: "error",
        message: error.message,
        retryable: Boolean(error.retryable),
        meta: { senderId: event.senderId }
      });
      return { skipped: true, error: error.message };
    }
  }

  async #safeInstagramSend(recipientId, text, mid) {
    try {
      return await sendInstagramText({
        recipientId,
        text,
        env: this.env,
        fetchImpl: this.fetchImpl
      });
    } catch (error) {
      await this.log.record({
        correlationId: mid,
        integration: "instagram",
        operation: "send",
        status: "error",
        message: error.message,
        retryable: Boolean(error.retryable),
        meta: { recipientId }
      });
      return { skipped: true, error: error.message };
    }
  }

  async #safeWhatsAppAlert(result, event) {
    if (!result.alertRecommended || !result.alertReason) {
      return { skipped: true, reason: "not_recommended" };
    }
    try {
      const alert = await sendWhatsAppAlert({
        buyer: result.buyer,
        reason: result.alertReason,
        matchName: result.matches?.[0]?.project?.name || "",
        messageId: event.mid,
        env: this.env,
        fetchImpl: this.fetchImpl,
        ledger: this.alerts
      });
      if (!alert.skipped && this.buyers?.patchBuyer) {
        await this.buyers.patchBuyer(result.buyer.instagramUserId, {
          lastAlertKey: alert.key,
          lastAlertAt: new Date().toISOString()
        });
      }
      return alert;
    } catch (error) {
      await this.log.record({
        correlationId: event.mid,
        integration: "whatsapp",
        operation: "alert",
        status: "error",
        message: error.message,
        retryable: Boolean(error.retryable),
        meta: { reason: result.alertReason }
      });
      return { skipped: true, error: error.message };
    }
  }
}
