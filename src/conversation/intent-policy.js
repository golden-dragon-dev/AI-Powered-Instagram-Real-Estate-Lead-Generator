/**
 * Current-turn intent and alert policy for Milestone 3.
 * Matching and commercial facts stay elsewhere; this only classifies buyer intent.
 */

const HIGH_INTENT_SIGNALS = [
  "reserve_interest",
  "viewing_request",
  "callback_request",
  "agent_request"
];

/**
 * Normalize intents/signals for one message so negation and stop phrases win.
 */
export function refineTurnIntent({ intents = [], signals = [], facts = {}, message = "" } = {}) {
  const text = String(message || "");
  let nextIntents = [...intents];
  let nextSignals = [...signals];
  const nextFacts = { ...facts };

  if (isInformationalEoi(text)) {
    nextIntents = without(nextIntents, ["reserve", "viewing", "callback", "agent", "high_intent"]);
    nextSignals = without(nextSignals, HIGH_INTENT_SIGNALS.concat(["high_intent"]));
    if (!nextIntents.includes("eoi_info")) nextIntents.push("eoi_info");
    nextSignals.push("informational_eoi");
  }

  if (isNegatedReserve(text)) {
    nextIntents = without(nextIntents, ["reserve", "high_intent"]);
    nextSignals = without(nextSignals, ["reserve_interest", "high_intent"]);
    if (!nextIntents.includes("decline_reserve")) nextIntents.push("decline_reserve");
    nextSignals.push("decline_reserve");
  }

  // "book a viewing" is viewing, not a reservation hold.
  if (/\b(book|booking)\b/i.test(text) && /\b(viewing|visit|tour|see it|site visit)\b/i.test(text)) {
    nextIntents = without(nextIntents, ["reserve"]);
    nextSignals = without(nextSignals, ["reserve_interest"]);
    if (!nextIntents.includes("viewing")) nextIntents.push("viewing");
    if (!nextSignals.includes("viewing_request")) nextSignals.push("viewing_request");
    if (!nextIntents.includes("high_intent")) nextIntents.push("high_intent");
  }

  const contactPrefs = extractContactPreferences(text);
  if (contactPrefs.preferredContactChannel) {
    nextFacts.preferredContactChannel = contactPrefs.preferredContactChannel;
  }
  if (contactPrefs.noCalls === true) {
    nextFacts.noCalls = true;
  }
  if (contactPrefs.whatsappOnly === true) {
    nextFacts.preferredContactChannel = "whatsapp";
    nextFacts.noCalls = true;
  }

  // Prefer WhatsApp / no calls is not a full contact decline.
  if (contactPrefs.whatsappOnly || contactPrefs.noCalls) {
    nextIntents = without(nextIntents, ["decline_contact"]);
    nextSignals = without(nextSignals, ["contact_declined"]);
    delete nextFacts.contactDeclined;
  }

  if (isStopSales(text)) {
    nextIntents = without(nextIntents, ["reserve", "viewing", "callback", "agent", "high_intent", "search"]);
    nextSignals = without(nextSignals, HIGH_INTENT_SIGNALS.concat(["high_intent"]));
    if (!nextIntents.includes("stop_sales")) nextIntents.push("stop_sales");
    nextSignals.push("stop_sales");
    nextFacts.salesPathStopped = true;
    nextFacts.followUpStatus = "paused";
  }

  if (hasAlertableIntent(nextIntents, nextSignals) && !nextIntents.includes("high_intent")) {
    nextIntents.push("high_intent");
  }
  if (hasAlertableIntent(nextIntents, nextSignals) && !nextSignals.includes("high_intent")) {
    nextSignals.push("high_intent");
  }

  nextFacts.intentSignals = [...new Set(nextSignals)];
  return {
    intents: [...new Set(nextIntents)],
    signals: [...new Set(nextSignals)],
    facts: nextFacts
  };
}

export function hasAlertableIntent(intents = [], signals = []) {
  if (intents.includes("eoi_info") || intents.includes("decline_reserve") || intents.includes("stop_sales")) {
    return false;
  }
  if (signals.includes("informational_eoi") || signals.includes("decline_reserve") || signals.includes("stop_sales")) {
    return false;
  }
  return (
    intents.includes("reserve") ||
    intents.includes("viewing") ||
    intents.includes("agent") ||
    intents.includes("callback") ||
    signals.some((s) => HIGH_INTENT_SIGNALS.includes(s))
  );
}

export function alertReasonFromTurn(intents = [], signals = []) {
  if (intents.includes("agent") || signals.includes("agent_request")) return "agent_request";
  if (intents.includes("reserve") || signals.includes("reserve_interest")) return "reservation_request";
  if (intents.includes("viewing") || signals.includes("viewing_request")) return "viewing_request";
  if (intents.includes("callback") || signals.includes("callback_request")) return "callback_request";
  return null;
}

export function shouldSendAdvisorAlert({ intents = [], signals = [], buyer = null } = {}) {
  if (!hasAlertableIntent(intents, signals)) return false;
  if (buyer?.salesPathStopped) return false;
  if (intents.includes("stop_sales") || signals.includes("stop_sales")) return false;
  if (intents.includes("eoi_info") || signals.includes("informational_eoi")) return false;
  return true;
}

export function isInformationalEoi(text) {
  const value = String(text || "");
  return (
    /\b(expression of interest|eoi)\b/i.test(value) ||
    /\b(just\s+)?(interested|looking)\b/i.test(value) &&
      /\b(info|information|details|curious|browsing|for now)\b/i.test(value) ||
    /\binformational\b/i.test(value)
  );
}

export function isNegatedReserve(text) {
  return /\b(don'?t|do not|not|never)\s+(want to\s+)?(reserve|book|hold|secure)\b/i.test(String(text || ""));
}

export function isStopSales(text) {
  const value = String(text || "").trim();
  return (
    /^(i'?m good|im good|i am good|all good|that'?s all|thats all|no thanks|no thank you)([.!?]*)$/i.test(value) ||
    /\b(i'?m good|im good|i am good)\b/i.test(value) && value.length < 48 ||
    /\b(stop (the )?sales|stop pitching|enough for now|leave it for now)\b/i.test(value)
  );
}

export function extractContactPreferences(text) {
  const value = String(text || "");
  const prefs = {};
  if (
    /\b(whatsapp only|only whatsapp|prefer whatsapp|whatsapp me|message me on whatsapp|wa only)\b/i.test(value)
  ) {
    prefs.preferredContactChannel = "whatsapp";
    prefs.whatsappOnly = true;
  } else if (/\b(call me|phone me|prefer a call|phone call)\b/i.test(value)) {
    prefs.preferredContactChannel = "phone";
  }
  if (
    /\b(no calls?|don'?t call|do not call|no phone calls?|without (a )?call|prefer not to (be )?call)/i.test(
      value
    )
  ) {
    prefs.noCalls = true;
  }
  return prefs;
}

function without(list, remove) {
  const drop = new Set(remove);
  return list.filter((item) => !drop.has(item));
}
