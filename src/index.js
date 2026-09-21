export { createLocalStore, LocalStore } from "./store/local-store.js";
export { AirtableStore } from "./store/airtable-store.js";
export { BuyerService, mergeBuyer, buyerFromKnownFacts } from "./services/buyer-service.js";
export { PropertyService } from "./services/property-service.js";
export { matchInventory, matchCriteria, criteriaFromBuyer } from "./matching/matcher.js";
export { retrieveFacts, buildFactPack } from "./facts/retrieval.js";
export { validateMessage, extractCommercialClaims, missingDataHandoff } from "./facts/checker.js";
export { renderSafeReply } from "./facts/safe-reply.js";
export { validateCatalog } from "./schema/validate.js";
export { emptyBuyer, PROJECT_FIELDS, UNIT_FIELDS, DEVELOPER_FIELDS, BUYER_FIELDS } from "./schema/fields.js";
export {
  parseMoney,
  normalizeArea,
  normalizeBedrooms,
  normalizePropertyType
} from "./matching/normalize.js";
