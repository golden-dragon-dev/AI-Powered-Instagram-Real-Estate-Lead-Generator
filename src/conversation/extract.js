import {
  normalizeArea,
  normalizeBedrooms,
  normalizeDeveloper,
  normalizePropertyType,
  parseMoney
} from "../matching/normalize.js";
import { FINANCING_VALUES, USE_TYPES } from "../schema/fields.js";
import { applyChoiceFacts } from "./choices.js";

const AREA_PATTERNS = [
  /\byas(?:\s+island)?\b/i,
  /\bhudayriyat(?:\s+island)?\b/i,
  /\bsaadiyat(?:\s+island)?\b/i,
  /\b(?:al\s+)?reem(?:\s+island)?\b/i
];

const AREA_LABELS = {
  yas: "Yas",
  "yas island": "Yas",
  hudayriyat: "Hudayriyat",
  "hudayriyat island": "Hudayriyat",
  saadiyat: "Saadiyat",
  "saadiyat island": "Saadiyat",
  reem: "Al Reem",
  "reem island": "Al Reem",
  "al reem": "Al Reem",
  "al reem island": "Al Reem"
};

const PROJECT_HINTS = {
  "yas park views": "Yas Park Views",
  "yas studio one": "Yas Studio One",
  "yas waterfront residences": "Yas Waterfront Residences",
  "yas grove residences": "Yas Grove Residences",
  "hudayriyat beach villas": "Hudayriyat Beach Villas",
  "saadiyat lagoons": "Saadiyat Lagoons"
};

/**
 * Pull structured buyer facts from a free-text or quick-reply message.
 * Matching still happens in code; this only fills the buyer card.
 */
export function extractFactsFromMessage(message) {
  const text = String(message || "").trim();
  let facts = {};
  const signals = [];
  if (!text) return { facts, signals, intents: ["empty"] };

  const intents = detectIntents(text);

  // Editable quick-reply / choice aliases first, then free-text extractors.
  facts = applyChoiceFacts(text, facts);

  const budget = extractBudget(text);
  if (budget !== null) facts.budget = budget;

  const cash = extractCash(text);
  if (cash !== null) facts.cash = cash;

  const area = extractArea(text);
  if (area) facts.area = area;

  const bedrooms = extractBedrooms(text);
  if (bedrooms !== null) facts.bedrooms = bedrooms;

  const propertyType = extractPropertyType(text);
  if (propertyType) facts.propertyType = propertyType;

  const developer = extractDeveloper(text);
  if (developer) facts.developer = developer;

  const project = extractProject(text);
  if (project) facts.project = project;

  const financing = extractFinancing(text);
  if (financing) facts.financing = financing;

  const useType = extractUseType(text);
  if (useType) facts.useType = useType;

  const timeframe = extractTimeframe(text);
  if (timeframe) facts.timeframe = timeframe;

  const name = extractName(text);
  if (name) facts.name = name;

  const phone = extractPhone(text);
  if (phone) facts.phone = phone;

  if (intents.includes("decline_contact")) {
    facts.contactDeclined = true;
    signals.push("contact_declined");
  }

  if (intents.includes("high_intent")) signals.push("high_intent");
  if (intents.includes("reserve")) signals.push("reserve_interest");
  if (intents.includes("viewing")) signals.push("viewing_request");
  if (intents.includes("callback")) signals.push("callback_request");
  if (intents.includes("agent")) signals.push("agent_request");

  if (signals.length) facts.intentSignals = signals;

  return { facts, signals, intents };
}

export function detectIntents(message) {
  const text = String(message || "").toLowerCase();
  const intents = [];

  if (/^\s*(hi|hello|hey|good\s+(morning|afternoon|evening)|salam|assalam)/i.test(message)) {
    intents.push("greet");
  }
  if (/\b(start\s+fresh|start\s+over|new\s+search|reset\s+(my\s+)?search)\b/i.test(text)) {
    intents.push("start_fresh");
  }
  if (/^(continue|continue\s+please|pick\s+up|keep\s+going)([.!]?)$/i.test(text.trim())) {
    intents.push("continue");
  }
  if (/\b(thank|thanks|thx)\b/i.test(text)) intents.push("thanks");
  if (
    /\b(price|cost|how much|starting from|handover|availability|sold out)\b/i.test(text) ||
    (/\bunits?\s+(left|remaining|available)\b/i.test(text)) ||
    (/\bpayment\s*plan\b/i.test(text) && /\b(what|what'?s|tell|explain|details|for this|on this)\b/i.test(text))
  ) {
    intents.push("ask_facts");
  }
  if (/\b(looking|interested|want|need|search|find|show|recommend|options?|what do you (have|recommend))\b/i.test(text)) {
    intents.push("search");
  }
  if (/\b(reserve|book|booking|hold|secure)\b/i.test(text)) {
    intents.push("reserve");
    intents.push("high_intent");
  }
  if (/\b(viewing|visit|tour|see it|site visit)\b/i.test(text)) {
    intents.push("viewing");
    intents.push("high_intent");
  }
  if (/\b(call me|callback|phone me|whatsapp me|contact me)\b/i.test(text)) {
    intents.push("callback");
    intents.push("high_intent");
  }
  if (/\b(agent|human|advisor|speak to|talk to (a |an )?(person|someone|sales))\b/i.test(text)) {
    intents.push("agent");
    intents.push("high_intent");
  }
  if (/\b(yes|yeah|yep|yup|sure|ok|okay|sounds good|go ahead)\b/i.test(text) && text.length < 40) {
    intents.push("affirm");
  }
  if (
    /\b(don'?t want to (give|share)|prefer not|no phone|without (my )?phone|skip (the )?phone|won'?t give|not giving (my )?phone|keep browsing|no contact)\b/i.test(
      text
    )
  ) {
    intents.push("decline_contact");
  }
  if (/\b(budget|aed|br\b|bedroom|yas|hudayriyat|saadiyat|reem|apartment|villa|studio|townhouse)\b/i.test(text)) {
    intents.push("provide_facts");
  }
  if (/\b(actually|instead|change|make that|update|switch)\b/i.test(text)) {
    intents.push("update_requirement");
  }

  if (!intents.length) intents.push("other");
  return [...new Set(intents)];
}

const MONEY_TOKEN = "(\\d[\\d,]*(?:\\.\\d+)?\\s*[MmKk]?)";

function extractBudget(text) {
  const patterns = [
    new RegExp(
      `(?:budget(?:\\s+is|\\s+of)?|up to|around|about|max(?:imum)?)\\s*(?:of\\s*)?(?:AED|Dhs|Dh)?\\s*${MONEY_TOKEN}`,
      "i"
    ),
    new RegExp(`(?:AED|Dhs|Dh)\\s*${MONEY_TOKEN}\\s*(?:budget|total)?`, "i"),
    new RegExp(`\\b(\\d[\\d,]*(?:\\.\\d+)?\\s*[Mm])\\b(?:\\s*(?:budget|total))?`, "i")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const raw = match[1];
    // Do not treat a clear cash-in-hand thousand amount as budget.
    if (/[Kk]\b/.test(raw) && /\b(cash|available now|ready now|down)\b/i.test(text) && !/\bbudget\b/i.test(match[0])) {
      continue;
    }
    if (/budget|up to|around|about|max/i.test(match[0]) || /[Mm]\b/.test(raw) || /AED|Dhs|Dh/i.test(match[0])) {
      const amount = parseMoney(raw);
      if (amount !== null && amount >= 200_000) return amount;
    }
  }
  const have = text.match(
    new RegExp(`\\b(?:i\\s+have|with)\\s+(?:AED|Dhs|Dh)?\\s*(\\d[\\d,]*(?:\\.\\d+)?\\s*[Mm])`, "i")
  );
  if (have) {
    const amount = parseMoney(have[1]);
    if (amount !== null) return amount;
  }
  return null;
}

function extractCash(text) {
  const patterns = [
    new RegExp(
      `(?:cash(?:\\s+available|\\s+ready)?|down\\s*payment|initial(?:\\s+payment)?|put\\s+down|deposit|ready\\s+now|have\\s+now)\\s*(?:of\\s*|about\\s*|around\\s*)?(?:AED|Dhs|Dh)?\\s*${MONEY_TOKEN}`,
      "i"
    ),
    new RegExp(`${MONEY_TOKEN}\\s*(?:cash|down|ready\\s+now|available\\s+now)`, "i"),
    new RegExp(`\\b(\\d[\\d,]*(?:\\.\\d+)?\\s*[Kk])\\b(?=.*\\b(?:cash|down|now|ready|available|put\\s+down|deposit)\\b)`, "i"),
    new RegExp(`\\b(?:i\\s+have|with|i\\s+can\\s+put\\s+down)\\s+(?:about\\s+|around\\s+)?(?:AED|Dhs|Dh)?\\s*${MONEY_TOKEN}\\s*(?:available now|ready now|cash)?`, "i")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = parseMoney(match[1]);
    if (amount !== null && amount > 0) return amount;
  }
  const now = text.match(/\b(\d[\d,]*(?:\.\d+)?\s*[Kk])\s*(?:now|ready)\b/i);
  if (now) {
    const amount = parseMoney(now[1]);
    if (amount !== null && amount > 0) return amount;
  }
  return null;
}

function extractArea(text) {
  for (const pattern of AREA_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const key = match[0].toLowerCase().replace(/\s+/g, " ").trim();
    return normalizeArea(AREA_LABELS[key] || match[0]);
  }
  return null;
}

function extractBedrooms(text) {
  const change = text.match(
    /\b(?:actually|instead|change(?:\s+to)?|make that|update(?:\s+to)?|switch(?:\s+to)?)\b[\s\w,]{0,40}?\b(?:studio|(\d+)\s*(?:br|bed(?:room)?s?))\b/i
  );
  if (change) {
    if (/studio/i.test(change[0]) && !change[1]) return 0;
    if (change[1]) return normalizeBedrooms(change[1]);
  }
  if (/\bstudio\b/i.test(text)) return 0;
  const match = text.match(/\b(\d+)\s*(?:br|bed(?:room)?s?)\b/i);
  if (match) return normalizeBedrooms(match[1]);
  return null;
}

function extractPropertyType(text) {
  const match = text.match(/\b(apartments?|flats?|villas?|townhouses?|penthouses?|studios?)\b/i);
  if (!match) return null;
  return normalizePropertyType(match[1]);
}

function extractDeveloper(text) {
  const match = text.match(/\b(aldar|emaar|modon|reportage|mamsha)\b/i);
  if (!match) return null;
  return normalizeDeveloper(match[1]);
}

function extractProject(text) {
  const lower = text.toLowerCase();
  for (const [hint, label] of Object.entries(PROJECT_HINTS)) {
    if (lower.includes(hint)) return label;
  }
  const named = text.match(/\bproject\s+([A-Za-z0-9][A-Za-z0-9\s]{2,40})/i);
  if (named) return named[1].trim();
  return null;
}

function extractFinancing(text) {
  if (/\bpayment\s*plan\b/i.test(text) || /\binstal+ments?\b/i.test(text)) return "payment_plan";
  if (/\bmortgage\b/i.test(text) || /\bbank\s+finance\b/i.test(text)) return "mortgage";
  if (/\ball\s+cash\b/i.test(text) || /\bcash\s+buyer\b/i.test(text) || /\bfull\s+cash\b/i.test(text)) {
    return "cash";
  }
  return FINANCING_VALUES.includes(text) ? text : null;
}

function extractUseType(text) {
  if (/\binvest(ment|or)?\b/i.test(text) || /\brental\s+yield\b/i.test(text)) return "investment";
  if (/\bend\s*use\b/i.test(text) || /\blive\s+in\b/i.test(text) || /\bfor\s+(my\s+)?family\b/i.test(text)) {
    return "end_use";
  }
  return USE_TYPES.includes(text) ? text : null;
}

function extractTimeframe(text) {
  const match = text.match(/\b(this\s+month|next\s+month|this\s+year|asap|urgent|in\s+\d+\s+months?)\b/i);
  return match ? match[1].toLowerCase() : null;
}

function extractName(text) {
  const match = text.match(/\b(?:my\s+name\s+is|i\s+am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  return match ? match[1] : null;
}

function extractPhone(text) {
  const match = text.match(/(?:\+971|971|0)?5\d{8}\b/);
  return match ? match[0] : null;
}
