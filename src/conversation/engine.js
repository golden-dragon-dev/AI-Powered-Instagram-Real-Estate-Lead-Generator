import { missingDataHandoff, validateMessage } from "../facts/checker.js";
import { extractFactsFromMessage } from "./extract.js";
import { ConversationMemory } from "./memory.js";
import { canPitchBuyer, resolveMatches } from "./match-resolve.js";
import { summarizeBuyer, isCoreQualified } from "./qualify.js";
import { buildConversationReply, fallbackSafeText } from "./replies.js";
import { polishReplyWithModel } from "./llm.js";
import { understandMessageWithModel, understandMessageLocally, mergeUnderstanding } from "./understand.js";
import { isAffirmation, resolveAffirmation } from "./affirmation.js";
import { retrieveFacts } from "../facts/retrieval.js";
import {
  alertReasonFromTurn,
  hasAlertableIntent,
  refineTurnIntent,
  shouldSendAdvisorAlert
} from "./intent-policy.js";

function hasHighIntent(intents, signals = []) {
  return hasAlertableIntent(intents, signals);
}

function leadStatusFor(buyer, intents, signals, matchCount) {
  if (intents.includes("stop_sales") || buyer.salesPathStopped) return "paused";
  if (hasHighIntent(intents, signals)) return "high_intent";
  if (matchCount > 0 && isCoreQualified(buyer)) return "qualified";
  if (canPitchBuyer(buyer)) return "engaged";
  if (buyer.budgetAed || buyer.preferredAreas?.length) return "engaged";
  return buyer.leadStatus || "new";
}

/**
 * Conversation engine.
 * Claude understands natural messages into structured updates.
 * Matching, memory, and commercial facts stay in code / Airtable.
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
    const lastAskedField = this.memory.getLastAskedField(instagramUserId);
    const existingBuyer = await this.buyers.getOrCreate(instagramUserId);
    const recentTurns = this.memory.recentContext(instagramUserId, 6);

    let base = extractFactsFromMessage(text);

    let understanding = understandMessageLocally(text, {
      buyer: existingBuyer,
      lastAskedField
    });

    if (this.llm && options.useLlm !== false) {
      const claudeUnderstanding = await understandMessageWithModel(this.llm, {
        message: text,
        buyer: existingBuyer,
        lastAskedField,
        recentTurns
      });
      if (claudeUnderstanding) {
        understanding = claudeUnderstanding;
      }
    }

    const merged = mergeUnderstanding(base, understanding);
    let { facts, signals, intents, unsure, ack } = merged;
    const refined = refineTurnIntent({ intents, signals, facts, message: text });
    facts = refined.facts;
    signals = refined.signals;
    intents = refined.intents;

    // A new search or fact update reopens a previously paused sales path.
    if (
      buyerWouldResume(facts, intents) &&
      (existingBuyer.salesPathStopped || existingBuyer.followUpStatus === "paused")
    ) {
      facts.salesPathStopped = false;
      if (!facts.followUpStatus) facts.followUpStatus = "none";
    }

    const updatedFields = [];
    if (facts.budget !== undefined) updatedFields.push("budget");
    if (facts.cash !== undefined) updatedFields.push("cash");
    if (facts.area || facts.areas) updatedFields.push("area");
    if (facts.bedrooms !== undefined) updatedFields.push("bedrooms");
    if (facts.financing) updatedFields.push("financing");
    if (facts.preferredContactChannel) updatedFields.push("contact_channel");
    if (facts.noCalls === true) updatedFields.push("no_calls");

    const pendingOffer = this.memory.getPendingOffer(instagramUserId);
    if (isAffirmation(text) && pendingOffer) {
      const resolved = resolveAffirmation(pendingOffer, text);
      if (resolved?.facts) facts = { ...facts, ...resolved.facts };
      if (resolved?.clearPending) this.memory.setPendingOffer(instagramUserId, null);
      if (!intents.includes("affirm")) intents = [...intents, "affirm"];
    }

    if (/^both$/i.test(text) && pendingOffer?.type === "bedroom_choice") {
      this.memory.setPendingOffer(instagramUserId, null);
    }

    if (intents.includes("continue") || intents.includes("start_fresh")) {
      this.memory.setPendingOffer(instagramUserId, null);
    }

    if (intents.includes("start_fresh")) {
      await this.buyers.resetCriteria(instagramUserId);
      this.memory.clear(instagramUserId);
      facts = {};
      unsure = [];
      ack = null;
    }

    let buyer = await this.buyers.remember(instagramUserId, facts);
    if (facts.openToOtherAreas === true || signals.includes("area_flexible")) {
      buyer = await this.buyers.updateMeta(instagramUserId, {
        intentSignals: ["area_flexible"]
      });
      buyer = {
        ...buyer,
        openToOtherAreas: true,
        intentSignals: [...new Set([...(buyer.intentSignals || []), "area_flexible"])]
      };
    } else if (facts.area || facts.areas) {
      // A definite area correction supersedes an earlier "open to other areas"
      // preference. Without this, stale flexibility can bring the old area back.
      buyer = await this.buyers.replaceIntentSignals(
        instagramUserId,
        (buyer.intentSignals || []).filter((signal) => signal !== "area_flexible")
      );
    }

    if (facts.bedrooms !== undefined || facts.project || facts.area) {
      if (facts.bedrooms !== undefined || facts.project) {
        this.memory.setPendingOffer(instagramUserId, null);
      }
    }
    this.memory.addTurn(instagramUserId, {
      role: "user",
      text,
      intents,
      signals,
      understandingSource: understanding?.source || null
    });

    const handoffRequested = intents.includes("agent") || Boolean(options.handoffRequested);
    const highIntent = hasHighIntent(intents, signals) && !buyer.salesPathStopped && !intents.includes("stop_sales");
    const alertReason = alertReasonFromTurn(intents, signals);
    const alertRecommended = shouldSendAdvisorAlert({ intents, signals, buyer });

    const catalog = this.properties.catalog();
    const matchResult = resolveMatches(catalog, buyer);
    const packs = retrieveFacts(matchResult.matches);

    let draft = buildConversationReply({
      buyer,
      message: text,
      intents,
      packs,
      matches: matchResult.matches,
      matchMode: matchResult.mode,
      mismatches: matchResult.mismatches || [],
      highIntent,
      handoffRequested,
      pendingOffer: this.memory.getPendingOffer(instagramUserId),
      unsure,
      ack,
      lastAskedField,
      updatedFields
    });

    if (draft.pendingOffer) {
      this.memory.setPendingOffer(instagramUserId, draft.pendingOffer);
    } else if (draft.stage === "matched" || draft.stage === "soft_match") {
      if (!draft.nextQuestion) this.memory.setPendingOffer(instagramUserId, null);
    }

    this.memory.setLastAskedField(instagramUserId, draft.nextQuestion?.field || null);

    if (this.llm && options.useLlm !== false && packs.length && draft.stage !== "qualifying") {
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
        : "I can only share confirmed listing details. Tell me a budget and area and I will check what we have.";
      check = validateMessage(replyText, packs, {
        handoffRequested,
        handoffReason: handoffRequested ? "buyer_requested" : null,
        allowedBuyerAmounts
      });
      draft = { ...draft, text: replyText, stage: "fact_check_fallback", polished: false };
    }

    const status = leadStatusFor(buyer, intents, signals, matchResult.matchCount);
    const summary = this.memory.buildSummary(instagramUserId, {
      ...buyer,
      conversationSummary: summarizeBuyer(buyer)
    });

    const followUpStatus = intents.includes("stop_sales")
      ? "paused"
      : alertRecommended && !buyer.contactDeclined
        ? "pending_advisor"
        : buyer.followUpStatus === "paused" && !buyer.salesPathStopped
          ? "none"
          : buyer.followUpStatus || "none";

    // Current-turn signals replace sticky high-intent flags so old reserve/viewing
    // requests do not keep firing alerts after the buyer declines or stops.
    const durableSignals = (signals || []).filter(
      (signal) => !["high_intent", "reserve_interest", "viewing_request", "callback_request", "agent_request"].includes(signal)
    );

    buyer = await this.buyers.remember(instagramUserId, {
      intentSignals: durableSignals,
      contactDeclined: intents.includes("decline_contact") ? true : undefined,
      preferredContactChannel: facts.preferredContactChannel,
      noCalls: facts.noCalls,
      salesPathStopped: facts.salesPathStopped
    });
    buyer = await this.buyers.replaceIntentSignals(instagramUserId, [
      ...durableSignals,
      ...(facts.openToOtherAreas || signals.includes("area_flexible") ? ["area_flexible"] : [])
    ]);
    buyer = await this.buyers.updateMeta(instagramUserId, {
      leadStatus: status,
      conversationSummary: summary,
      followUpStatus,
      preferredContactChannel: facts.preferredContactChannel || buyer.preferredContactChannel,
      noCalls: facts.noCalls === true ? true : buyer.noCalls,
      salesPathStopped: facts.salesPathStopped === true ? true : Boolean(buyer.salesPathStopped && !buyerWouldResume(facts, intents))
    });

    this.memory.addTurn(instagramUserId, {
      role: "assistant",
      text: replyText,
      stage: draft.stage,
      matchCount: matchResult.matchCount,
      factCheckOk: check.ok,
      pendingOffer: this.memory.getPendingOffer(instagramUserId)
    });

    return {
      reply: replyText,
      stage: draft.stage,
      polished: Boolean(draft.polished),
      understood: Boolean(understanding?.source && understanding.source !== "none"),
      understandingSource: understanding?.source || null,
      buyer,
      intents,
      signals,
      unsure,
      alertReason,
      alertRecommended,
      criteria: matchResult.criteria,
      matchCount: matchResult.matchCount,
      matchMode: matchResult.mode,
      fitTier: matchResult.fitTier || matchResult.mode,
      matches: matchResult.matches,
      mismatches: matchResult.mismatches || [],
      compromises: matchResult.compromises || [],
      packs,
      check,
      missingData: missingDataHandoff(packs),
      handoffRequired: check.handoffRequired,
      nextQuestion: draft.nextQuestion || null,
      pendingOffer: this.memory.getPendingOffer(instagramUserId),
      context: this.memory.recentContext(instagramUserId)
    };
  }
}

function buyerWouldResume(facts, intents) {
  return Boolean(
    facts.budget !== undefined ||
      facts.cash !== undefined ||
      facts.area ||
      facts.areas ||
      facts.bedrooms !== undefined ||
      facts.project ||
      intents.includes("search") ||
      intents.includes("start_fresh") ||
      intents.includes("continue") ||
      intents.includes("provide_facts")
  );
}

export function createConversationEngine(services, options = {}) {
  return new ConversationEngine({
    buyers: services.buyers,
    properties: services.properties,
    memory: options.memory,
    llm: options.llm || null
  });
}
