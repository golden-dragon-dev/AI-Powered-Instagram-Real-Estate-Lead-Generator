import path from "node:path";
import { JsonFileStore, runtimeRoot } from "./json-store.js";
import { buildCallRequestSummary } from "../conversation/intent-policy.js";

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

export class CallRequestStore {
  constructor({ rootDir } = {}) {
    this.store = new JsonFileStore(path.join(rootDir || runtimeRoot(), "call-requests.json"));
  }

  async record(entry) {
    const row = {
      at: new Date().toISOString(),
      ...entry
    };
    await this.store.update((current) => {
      const list = Array.isArray(current) ? current : [];
      list.push(row);
      return list.slice(-500);
    }, []);
    return row;
  }

  async list(limit = 50) {
    const rows = await this.store.read([]);
    return rows.slice(-limit);
  }
}

export function buildAlertTemplateComponents({ buyer, reason, matchName = "", summaryText = "" }) {
  return [
    {
      type: "body",
      parameters: [
        { type: "text", text: String(buyer.phone || "unknown").slice(0, 60) },
        { type: "text", text: String(buyer.instagramUserId || "unknown").slice(0, 60) },
        { type: "text", text: String(reason || "call_request").slice(0, 60) },
        { type: "text", text: String(matchName || buyer.projectInterest || "none").slice(0, 60) },
        {
          type: "text",
          text: String(summaryText || buyer.conversationSummary || "No summary yet").slice(0, 120)
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
  summaryText = "",
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
  const claimed = await alertLedger.mark(key, { reason, buyerId: buyer.instagramUserId, phone: buyer.phone });
  if (!claimed) {
    return { skipped: true, reason: "duplicate_alert", key };
  }

  const graphVersion = env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const url = `${env.META_GRAPH_BASE_URL || "https://graph.facebook.com"}/${graphVersion}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const bodyPayload = {
    messaging_product: "whatsapp",
    to: String(env.WHATSAPP_ALERT_TO).replace(/\D/g, ""),
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
      components: buildAlertTemplateComponents({
        buyer,
        reason,
        matchName,
        summaryText: summaryText || buildCallRequestSummary(buyer, { reason })
      })
    }
  };

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`
    },
    body: JSON.stringify(bodyPayload)
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
    wamid: body.messages?.[0]?.id || null,
    summary: summaryText || buildCallRequestSummary(buyer, { reason })
  };
}
