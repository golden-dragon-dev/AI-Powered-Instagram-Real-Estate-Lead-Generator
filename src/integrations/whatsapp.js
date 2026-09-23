import path from "node:path";
import { JsonFileStore, runtimeRoot } from "./json-store.js";

const DEFAULT_GRAPH_VERSION = "v21.0";

export function whatsappConfigured(env = process.env) {
  return Boolean(
    env.WHATSAPP_ACCESS_TOKEN &&
      env.WHATSAPP_PHONE_NUMBER_ID &&
      env.WHATSAPP_ALERT_TO &&
      env.WHATSAPP_TEMPLATE_NAME
  );
}

export function alertEventKey({ buyerId, reason, messageId }) {
  return `${buyerId}:${reason}:${messageId || "unknown"}`;
}

export class AlertLedger {
  constructor({ rootDir } = {}) {
    this.store = new JsonFileStore(path.join(rootDir || runtimeRoot(), "alert-ledger.json"));
  }

  async has(key) {
    const data = await this.store.read({ keys: {} });
    return Boolean(data.keys?.[String(key)]);
  }

  async mark(key, meta = {}) {
    let inserted = false;
    await this.store.update((current) => {
      const data = current && typeof current === "object" ? current : { keys: {} };
      data.keys = data.keys || {};
      if (data.keys[String(key)]) {
        inserted = false;
        return data;
      }
      data.keys[String(key)] = {
        at: new Date().toISOString(),
        ...meta
      };
      inserted = true;
      const entries = Object.entries(data.keys);
      if (entries.length > 2000) {
        entries.sort((a, b) => String(a[1]?.at || "").localeCompare(String(b[1]?.at || "")));
        data.keys = Object.fromEntries(entries.slice(-2000));
      }
      return data;
    }, { keys: {} });
    return inserted;
  }
}

export function buildAlertTemplateComponents({ buyer, reason, matchName = "" }) {
  const channel =
    buyer.preferredContactChannel === "whatsapp"
      ? buyer.noCalls
        ? "WhatsApp only, no calls"
        : "WhatsApp preferred"
      : buyer.noCalls
        ? "No calls"
        : "Standard contact";
  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: String(buyer.instagramUserId || "unknown").slice(0, 60) },
        { type: "text", text: String(reason || "high_intent").slice(0, 60) },
        { type: "text", text: String(matchName || buyer.projectInterest || "none").slice(0, 60) },
        { type: "text", text: channel.slice(0, 60) },
        {
          type: "text",
          text: String(buyer.conversationSummary || "No summary yet").slice(0, 120)
        }
      ]
    }
  ];
}

export async function sendWhatsAppAlert({
  buyer,
  reason,
  matchName = "",
  messageId = null,
  env = process.env,
  fetchImpl = fetch,
  ledger = null
} = {}) {
  if (!whatsappConfigured(env)) {
    return { skipped: true, reason: "WhatsApp alert env incomplete" };
  }
  const key = alertEventKey({
    buyerId: buyer.instagramUserId,
    reason,
    messageId
  });
  const alertLedger = ledger || new AlertLedger({ rootDir: runtimeRoot(env) });
  const claimed = await alertLedger.mark(key, { reason, buyerId: buyer.instagramUserId });
  if (!claimed) {
    return { skipped: true, reason: "duplicate_alert", key };
  }

  const graphVersion = env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const url = `${env.META_GRAPH_BASE_URL || "https://graph.facebook.com"}/${graphVersion}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: String(env.WHATSAPP_ALERT_TO).replace(/\D/g, ""),
      type: "template",
      template: {
        name: env.WHATSAPP_TEMPLATE_NAME,
        language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
        components: buildAlertTemplateComponents({ buyer, reason, matchName })
      }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || response.statusText || "WhatsApp alert failed";
    const error = new Error(detail);
    error.status = response.status;
    error.retryable = response.status >= 500;
    error.alertKey = key;
    throw error;
  }
  return {
    skipped: false,
    key,
    wamid: body.messages?.[0]?.id || null
  };
}
