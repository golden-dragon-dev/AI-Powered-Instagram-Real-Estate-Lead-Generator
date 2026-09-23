/**
 * Buyer intent and call-request policy for Milestone 3.
 * High buying interest stays in the AI conversation.
 * A human handoff starts only after Request a Call + phone submit.
 */

const HIGH_INTENT_SIGNALS = [
  "reserve_interest",
  "viewing_request",
  "callback_request",
  "agent_request",
  "buy_interest"
];

/**
 * Normalize intents/signals for one message.
 */
export function refineTurnIntent({ intents = [], signals = [], facts = {}, message = "" } = {}) {
  const text = String(message || "");
  let nextIntents = [...intents];
  let nextSignals = [...signals];
  const nextFacts = { ...facts };

  if (isInformationalEoi(text) && !wantsCallRequest(text)) {
    nextIntents = without(nextIntents, ["reserve", "viewing", "callback", "agent", "high_intent", "request_call"]);
    nextSignals = without(nextSignals, HIGH_INTENT_SIGNALS.concat(["high_intent", "request_call"]));
    if (!nextIntents.includes("eoi_info")) nextIntents.push("eoi_info");
    nextSignals.push("informational_eoi");
  }

  if (isNegatedReserve(text)) {
    nextIntents = without(nextIntents, ["reserve", "high_intent", "request_call"]);
    nextSignals = without(nextSignals, ["reserve_interest", "high_intent", "request_call"]);
    if (!nextIntents.includes("decline_reserve")) nextIntents.push("decline_reserve");
    nextSignals.push("decline_reserve");
  }

  // "book a viewing" is viewing research, not a reservation hold.
  if (/\b(book|booking)\b/i.test(text) && /\b(viewing|visit|tour|see it|site visit)\b/i.test(text)) {
    nextIntents = without(nextIntents, ["reserve"]);
    nextSignals = without(nextSignals, ["reserve_interest"]);
    if (!nextIntents.includes("viewing")) nextIntents.push("viewing");
    if (!nextSignals.includes("viewing_request")) nextSignals.push("viewing_request");
  }

  if (wantsCallRequest(text)) {
    if (!nextIntents.includes("request_call")) nextIntents.push("request_call");
    nextSignals.push("request_call");
    nextFacts.salesPathStopped = false;
  }

  if (isDeclineCallOffer(text)) {
    nextIntents = without(nextIntents, ["request_call", "callback", "agent", "high_intent"]);
    nextSignals = without(nextSignals, ["request_call", "callback_request", "agent_request", "high_intent"]);
    if (!nextIntents.includes("decline_call")) nextIntents.push("decline_call");
    nextSignals.push("decline_call");
    nextFacts.contactDeclined = true;
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
  if (contactPrefs.whatsappOnly || contactPrefs.noCalls) {
    nextIntents = without(nextIntents, ["decline_contact"]);
    nextSignals = without(nextSignals, ["contact_declined"]);
    delete nextFacts.contactDeclined;
  }

  // Buying interest is conversational only. It never becomes an alert by itself.
  if (hasBuyingInterest(nextIntents, nextSignals, text) && !nextIntents.includes("high_intent")) {
    nextIntents.push("high_intent");
  }
  if (hasBuyingInterest(nextIntents, nextSignals, text) && !nextSignals.includes("high_intent")) {
    nextSignals.push("high_intent");
  }

  nextFacts.intentSignals = [...new Set(nextSignals)];
  return {
    intents: [...new Set(nextIntents)],
    signals: [...new Set(nextSignals)],
    facts: nextFacts
  };
}

export function hasBuyingInterest(intents = [], signals = [], message = "") {
  if (intents.includes("decline_call") || intents.includes("decline_reserve") || intents.includes("eoi_info")) {
    return false;
  }
  return (
    intents.includes("reserve") ||
    intents.includes("viewing") ||
    intents.includes("agent") ||
    intents.includes("callback") ||
    intents.includes("request_call") ||
    /\b(want to buy|ready to buy|i want this|interested in buying)\b/i.test(String(message || "")) ||
    signals.some((s) => HIGH_INTENT_SIGNALS.includes(s))
  );
}

/**
 * Explicit request for human help. This offers Request a Call, but does not notify yet.
 */
export function wantsCallRequest(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (isDeclineCallOffer(value)) return false;
  if (isProcessQuestionOnly(value)) return false;

  return (
    /\b(call me|phone me|ring me|can you call|please call|request a call|want a call)\b/i.test(value) ||
    /\b(speak to|talk to)\b.+\b(someone|anybody|advisor|agent|human|person|sales)\b/i.test(value) ||
    /\b(speak to someone|talk to someone|speak with (an? )?advisor|human help)\b/i.test(value) ||
    /\b(i want to proceed|ready to proceed|want to close|close this)\b/i.test(value) ||
    /\b(i want to reserve|want to reserve this|reserve this|make an eoi|submit an eoi|place an eoi)\b/i.test(value) ||
    /\b(i want to buy this|ready to buy this|i want this unit|buy this one)\b/i.test(value) ||
    /\b(more information from a person|explain this to me|someone explain)\b/i.test(value) ||
    /\b(can someone|could someone)\b.+\b(call|help|explain|contact)\b/i.test(value)
  );
}

export function isProcessQuestionOnly(text) {
  const value = String(text || "");
  return (
    /\b(what|how|which|when|tell me)\b/i.test(value) &&
    /\b(reserve|reservation|eoi|payment plan|need to|required|documents?|process)\b/i.test(value) &&
    !/\b(call me|speak to|talk to|request a call)\b/i.test(value)
  );
}

/**
 * Alert / human lead only after Request a Call is submitted with a phone number.
 */
export function shouldSendAdvisorAlert({ callRequestSubmitted = false, buyer = null } = {}) {
  if (!callRequestSubmitted) return false;
  if (!buyer?.phone) return false;
  if (buyer.salesPathStopped) return false;
  return true;
}

export function alertReasonFromTurn(intents = [], signals = []) {
  if (intents.includes("request_call") || signals.includes("request_call")) return "call_request";
  if (intents.includes("agent") || signals.includes("agent_request")) return "call_request";
  if (intents.includes("callback") || signals.includes("callback_request")) return "call_request";
  if (intents.includes("reserve") || signals.includes("reserve_interest")) return "call_request";
  return "call_request";
}

export function isInformationalEoi(text) {
  const value = String(text || "");
  return (
    /\b(expression of interest|eoi)\b/i.test(value) && /\b(info|information|about|what is|tell me)\b/i.test(value) ||
    (/\b(just\s+)?(interested|looking)\b/i.test(value) &&
      /\b(info|information|details|curious|browsing|for now)\b/i.test(value)) ||
    /\binformational\b/i.test(value)
  );
}

export function isNegatedReserve(text) {
  return /\b(don'?t|do not|not|never)\s+(want to\s+)?(reserve|book|hold|secure)\b/i.test(String(text || ""));
}

export function isDeclineCallOffer(text) {
  const value = String(text || "").trim();
  return (
    /^(i'?m good|im good|i am good|all good|that'?s all|thats all|no thanks|no thank you)([.!?]*)$/i.test(value) ||
    /\b(i'?m good|im good|i am good)\b/i.test(value) && value.length < 48 ||
    /\b(just browsing|i'?ll let you know|no call|don'?t call|do not call)\b/i.test(value) ||
    /\b(just tell me here|just send (me )?the information|send (it|the info|the information) here|keep it here)\b/i.test(
      value
    ) ||
    /\b(no thanks).+\b(just|here|information|browsing)\b/i.test(value)
  );
}

/** @deprecated use isDeclineCallOffer — kept for older imports */
export function isStopSales(text) {
  return isDeclineCallOffer(text);
}

export function extractContactPreferences(text) {
  const value = String(text || "");
  const prefs = {};
  if (
    /\b(whatsapp only|only whatsapp|prefer whatsapp|whatsapp me|message me on whatsapp|wa only)\b/i.test(value)
  ) {
    prefs.preferredContactChannel = "whatsapp";
    prefs.whatsappOnly = true;
  } else if (/\b(call me|phone me|prefer a call|phone call)\b/i.test(value) && !isDeclineCallOffer(value)) {
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

export function buildCallRequestSummary(buyer, { matches = [], reason = "Requested a call" } = {}) {
  const lines = ["CALL REQUEST"];
  if (buyer.phone) lines.push(`Phone: ${buyer.phone}`);
  if (buyer.name) lines.push(`Name: ${buyer.name}`);
  if (buyer.budgetAed) lines.push(`Budget: AED ${Number(buyer.budgetAed).toLocaleString("en-US")}`);
  if (buyer.preferredAreas?.length) lines.push(`Area: ${buyer.preferredAreas.join(", ")}`);
  if (buyer.bedrooms?.length) {
    const beds = buyer.bedrooms.map((n) => (n === 0 ? "studio" : `${n}BR`)).join(" or ");
    lines.push(`Looking for: ${beds}`);
  }
  if (buyer.propertyTypes?.length) lines.push(`Property type: ${buyer.propertyTypes.join(", ")}`);
  if (buyer.financing && buyer.financing !== "unknown") {
    lines.push(`Payment: ${buyer.financing === "payment_plan" ? "Developer payment plan" : buyer.financing}`);
  }
  if (buyer.cashAvailableAed != null) {
    lines.push(`Initial cash: AED ${Number(buyer.cashAvailableAed).toLocaleString("en-US")}`);
  }
  if (buyer.useType && buyer.useType !== "unknown") lines.push(`Use: ${buyer.useType}`);
  const project = matches[0]?.project?.name || buyer.projectInterest;
  if (project) lines.push(`Interested in: ${project}`);
  lines.push(`Reason: ${reason}`);
  if (buyer.conversationSummary) lines.push(`Summary: ${buyer.conversationSummary}`);
  return lines.join("\n");
}

function without(list, remove) {
  const drop = new Set(remove);
  return list.filter((item) => !drop.has(item));
}
