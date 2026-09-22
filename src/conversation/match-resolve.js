import { criteriaFromBuyer, matchInventory } from "../matching/matcher.js";
import { limitMatchesForPitch } from "./preferences.js";

/**
 * Project-led matching: try exact buyer criteria first, then useful softenings.
 * Always returns only inventory matches (confirmed rows). Soft preferences only rank.
 */
export function resolveMatches(catalog, buyer) {
  const base = criteriaFromBuyer(buyer);
  const attempts = [
    { mode: "exact", criteria: base },
    {
      mode: "without_bedrooms",
      criteria: { ...base, bedrooms: null, propertyType: null }
    },
    {
      mode: "without_cash",
      criteria: { ...base, cashAvailableAed: null }
    },
    {
      mode: "budget_area_only",
      criteria: {
        emirate: base.emirate,
        area: base.area,
        project: base.project,
        developer: base.developer,
        budgetAed: base.budgetAed,
        bedrooms: null,
        propertyType: null,
        cashAvailableAed: null,
        paymentPlanRequired: false
      }
    }
  ];

  // If bedrooms are not set yet, skip exact-only path duplication
  const seen = new Set();
  for (const attempt of attempts) {
    const key = JSON.stringify(attempt.criteria);
    if (seen.has(key)) continue;
    seen.add(key);

    // Need at least budget + (area or project) before pitching
    if (!canPitchWithCriteria(attempt.criteria)) continue;

    const result = matchInventory(catalog, attempt.criteria);
    if (result.matchCount > 0) {
      const pitched = limitMatchesForPitch(result.matches);
      return {
        mode: attempt.mode,
        criteria: attempt.criteria,
        matches: pitched,
        matchCount: pitched.length,
        allMatches: result.matches,
        rejected: result.rejected
      };
    }
  }

  return {
    mode: "none",
    criteria: base,
    matches: [],
    matchCount: 0,
    allMatches: [],
    rejected: []
  };
}

export function canPitchBuyer(buyer) {
  return Boolean(
    buyer.budgetAed && (buyer.preferredAreas?.length || buyer.projectInterest || buyer.developerInterest)
  );
}

function canPitchWithCriteria(criteria) {
  return Boolean(criteria.budgetAed && (criteria.area || criteria.project || criteria.developer));
}

export function bedroomOptionsFromMatches(matches) {
  const beds = [...new Set(matches.map((row) => row.unit.bedrooms))].sort((a, b) => a - b);
  return beds;
}
