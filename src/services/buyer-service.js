import { emptyBuyer, FINANCING_VALUES, USE_TYPES } from "../schema/fields.js";
import {
  normalizeArea,
  normalizeBedrooms,
  normalizeDeveloper,
  normalizePropertyType,
  parseMoney
} from "../matching/normalize.js";

function nowIso() {
  return new Date().toISOString();
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

export function mergeBuyer(existing, patch) {
  const base = existing ? { ...existing } : emptyBuyer(patch.instagramUserId);
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (key === "instagramUserId") continue;
    if (!hasValue(value)) continue;
    next[key] = value;
  }
  if (hasValue(patch.preferredAreas)) {
    next.preferredAreas = uniqueStrings([...(base.preferredAreas || []), ...patch.preferredAreas]);
  }
  if (hasValue(patch.propertyTypes)) {
    next.propertyTypes = uniqueStrings([...(base.propertyTypes || []), ...patch.propertyTypes]);
  }
  if (hasValue(patch.bedrooms)) {
    next.bedrooms = uniqueNumbers([...(base.bedrooms || []), ...patch.bedrooms]);
  }
  if (hasValue(patch.intentSignals)) {
    next.intentSignals = uniqueStrings([...(base.intentSignals || []), ...patch.intentSignals]);
  }
  const timestamp = nowIso();
  if (!next.createdAt) next.createdAt = timestamp;
  next.updatedAt = timestamp;
  next.lastSeenAt = timestamp;
  return next;
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value)))];
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value)))];
}

export function buyerFromKnownFacts(instagramUserId, facts = {}) {
  const patch = { instagramUserId };
  if (facts.budget !== undefined) patch.budgetAed = parseMoney(facts.budget);
  if (facts.cash !== undefined) patch.cashAvailableAed = parseMoney(facts.cash);
  if (facts.area) patch.preferredAreas = [normalizeArea(facts.area)].filter(Boolean);
  if (facts.areas) patch.preferredAreas = facts.areas.map(normalizeArea).filter(Boolean);
  if (facts.emirate) patch.preferredEmirate = facts.emirate;
  if (facts.developer) patch.developerInterest = normalizeDeveloper(facts.developer);
  if (facts.project) patch.projectInterest = facts.project;
  if (facts.propertyType) patch.propertyTypes = [normalizePropertyType(facts.propertyType)].filter(Boolean);
  if (facts.propertyTypes) patch.propertyTypes = facts.propertyTypes.map(normalizePropertyType).filter(Boolean);
  if (facts.bedrooms !== undefined) {
    const bedrooms = Array.isArray(facts.bedrooms) ? facts.bedrooms : [facts.bedrooms];
    patch.bedrooms = bedrooms.map(normalizeBedrooms).filter((value) => value !== null);
  }
  if (facts.useType && USE_TYPES.includes(facts.useType)) patch.useType = facts.useType;
  if (facts.financing && FINANCING_VALUES.includes(facts.financing)) patch.financing = facts.financing;
  if (facts.timeframe) patch.timeframe = facts.timeframe;
  if (facts.name) patch.name = facts.name;
  if (facts.phone) patch.phone = facts.phone;
  return patch;
}

export class BuyerService {
  constructor(store) {
    this.store = store;
  }

  async getOrCreate(instagramUserId) {
    const existing = this.store.getBuyer(instagramUserId);
    if (existing) return existing;
    const created = mergeBuyer(null, { instagramUserId });
    return this.store.saveBuyer(created);
  }

  async remember(instagramUserId, facts) {
    const existing = await this.getOrCreate(instagramUserId);
    const patch = buyerFromKnownFacts(instagramUserId, facts);
    const merged = mergeBuyer(existing, patch);
    return this.store.saveBuyer(merged);
  }

  missingQualificationFields(buyer) {
    const missing = [];
    if (!hasValue(buyer.budgetAed)) missing.push("budgetAed");
    if (!hasValue(buyer.preferredAreas) && !hasValue(buyer.projectInterest)) missing.push("preferredAreas");
    if (!hasValue(buyer.propertyTypes) && !hasValue(buyer.bedrooms)) missing.push("propertyTypes");
    return missing;
  }
}
