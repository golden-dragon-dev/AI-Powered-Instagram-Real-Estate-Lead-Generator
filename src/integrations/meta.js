import crypto from "node:crypto";

const DEFAULT_GRAPH_VERSION = "v21.0";

export function metaConfig(env = process.env) {
  return {
    verifyToken: env.META_VERIFY_TOKEN || "",
    appSecret: env.META_APP_SECRET || "",
    pageAccessToken: env.META_PAGE_ACCESS_TOKEN || "",
    pageId: env.META_PAGE_ID || "",
    graphVersion: env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
    graphBaseUrl: env.META_GRAPH_BASE_URL || "https://graph.facebook.com"
  };
}

export function verifyWebhookChallenge(query, env = process.env) {
  const mode = String(query["hub.mode"] || "");
  const token = String(query["hub.verify_token"] || "");
  const challenge = String(query["hub.challenge"] || "");
  const expected = metaConfig(env).verifyToken;
  if (mode === "subscribe" && expected && token === expected) {
    return { ok: true, challenge };
  }
  return { ok: false, challenge: null };
}

export function verifySignature(rawBody, signatureHeader, env = process.env) {
  const secret = metaConfig(env).appSecret;
  if (!secret) return false;
  const provided = String(signatureHeader || "");
  if (!provided.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Extract inbound Instagram text messages from a Meta webhook payload.
 */
export function parseInstagramMessages(payload) {
  const events = [];
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const item of messaging) {
      const message = item.message;
      if (!message || message.is_echo) continue;
      const text = String(message.text || "").trim();
      if (!text) continue;
      const senderId = String(item.sender?.id || "").trim();
      const mid = String(message.mid || "").trim();
      if (!senderId || !mid) continue;
      events.push({
        mid,
        senderId,
        text,
        timestamp: item.timestamp || null,
        entryId: entry.id || null
      });
    }
  }
  return events;
}

export async function sendInstagramText({
  recipientId,
  text,
  env = process.env,
  fetchImpl = fetch
} = {}) {
  const config = metaConfig(env);
  if (!config.pageAccessToken || !config.pageId) {
    throw new Error("META_PAGE_ACCESS_TOKEN and META_PAGE_ID are required to send Instagram replies");
  }
  const url = `${config.graphBaseUrl}/${config.graphVersion}/${config.pageId}/messages`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.pageAccessToken}`
    },
    body: JSON.stringify({
      recipient: { id: String(recipientId) },
      messaging_type: "RESPONSE",
      message: { text: String(text || "").slice(0, 1000) }
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || response.statusText || "Instagram send failed";
    const error = new Error(detail);
    error.status = response.status;
    error.retryable = response.status >= 500;
    throw error;
  }
  return {
    recipientId: body.recipient_id || recipientId,
    messageId: body.message_id || null
  };
}
