import { missingDataHandoff, validateMessage } from "../facts/checker.js";
import { criteriaFromBuyer } from "../matching/matcher.js";
import { extractFactsFromMessage } from "./extract.js";
import { ConversationMemory } from "./memory.js";
import { isCoreQualified, summarizeBuyer } from "./qualify.js";
import { buildConversationReply, fallbackSafeText } from "./replies.js";
import { polishReplyWithModel } from "./llm.js";

function hasHighIntent(intents, buyer) {
  if (intents.includes("high_intent")) return true;
  const signals = buyer.intentSignals || [];
  return signals.some((s) =>
    ["high_intent", "reserve_interest", "viewing_request", "callback_request", "agent_request"].includes(s)
  );
}

function leadStatusFor(buyer, intents, matchCount) {
  if (hasHighIntent(intents, buyer)) return "high_intent";
  if (matchCount > 0 && isCoreQualified(buyer)) return "qualified";
  if (isCoreQualified(buyer)) return "qualifying";
  if (buyer.budgetAed || buyer.preferredAreas?.length) return "engaged";
  return buyer.leadStatus || "new";
}

/**
 * Test-environment conversation engine.
 * Uses buyer memory + inventory matching + fact check. Optional model polish never bypasses the checker.
 */
export class ConversationEngine {
  constructor({ buyers, properties, memory, llm = null } = {}) {
    if (!buyers || !properties) throw new Error("ConversationEngine requires buyers and properties");
    this.buyers = buyers;
    this.properties = properties;
    this.memory = memory || new ConversationMemory();
    this.llm = llm;
  }

  async handleMessage(instagramUserId, message, options = {}) {
    const text = String(message || "").trim();
    const { facts, signals, intents } = extractFactsFromMessage(text);

    let buyer = await this.buyers.remember(instagramUserId, facts);
    this.memory.addTurn(instagramUserId, { role: "user", text, intents, signals });

    const handoffRequested = intents.includes("agent") || Boolean(options.handoffRequested);
    const highIntent = hasHighIntent(intents, buyer);

    let packs = [];
    let matchResult = { matchCount: 0, matches: [], criteria: criteriaFromBuyer(buyer) };

    if (isCoreQualified(buyer) || buyer.projectInterest) {
      matchResult = this.properties.matchBuyer(buyer);
      packs = this.properties.factsFor(matchResult);
    }

    let draft = buildConversationReply({
      buyer,
      message: text,
      intents,
      packs,
      matchCount: matchResult.matchCount,
      highIntent,
      handoffRequested
    });

    if (this.llm && options.useLlm !== false && packs.length) {
      const polished = await polishReplyWithModel(this.llm, {
        buyer,
        packs,
        draftText: draft.text,
        intents
      });
      if (polished) draft = { ...draft, text: polished, polished: true };
    }

    const allowedBuyerAmounts = [buyer.budgetAed, buyer.cashAvailableAed].filter(
      (value) => value !== null && value !== undefined
    );

    let check = validateMessage(draft.text, packs, {
      handoffRequested,
      handoffReason: handoffRequested ? "buyer_requested" : null,
      allowedBuyerAmounts
    });

    let replyText = draft.text;
    if (!check.ok) {
      replyText = packs.length
        ? fallbackSafeText(packs)
        : "I can only share confirmed listing details. Ask me about budget, area, or bedrooms and I will check the approved list.";
      check = validateMessage(replyText, packs, {
        handoffRequested,
        handoffReason: handoffRequested ? "buyer_requested" : null,
        allowedBuyerAmounts
      });
      draft = { ...draft, text: replyText, stage: "fact_check_fallback", polished: false };
    }

    const status = leadStatusFor(buyer, intents, matchResult.matchCount);
    const summary = this.memory.buildSummary(instagramUserId, {
      ...buyer,
      conversationSummary: summarizeBuyer(buyer)
    });

    buyer = await this.buyers.remember(instagramUserId, {
      intentSignals: signals.length ? signals : undefined,
      contactDeclined: intents.includes("decline_contact") ? true : undefined
    });
    buyer = await this.buyers.updateMeta(instagramUserId, {
      leadStatus: status,
      conversationSummary: summary,
      followUpStatus: highIntent && !buyer.contactDeclined ? "pending_advisor" : buyer.followUpStatus || "none"
    });

    this.memory.addTurn(instagramUserId, {
      role: "assistant",
      text: replyText,
      stage: draft.stage,
      matchCount: matchResult.matchCount,
      factCheckOk: check.ok
    });

    return {
      reply: replyText,
      stage: draft.stage,
      buyer,
      intents,
      signals,
      criteria: matchResult.criteria,
      matchCount: matchResult.matchCount,
      matches: matchResult.matches,
      packs,
      check,
      missingData: missingDataHandoff(packs),
      handoffRequired: check.handoffRequired,
      nextQuestion: draft.nextQuestion || null,
      context: this.memory.recentContext(instagramUserId)
    };
  }
}

export function createConversationEngine(services, options = {}) {
  return new ConversationEngine({
    buyers: services.buyers,
    properties: services.properties,
    memory: options.memory,
    llm: options.llm || null
  });
}
