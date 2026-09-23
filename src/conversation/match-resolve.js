import { criteriaFromBuyer, matchInventory } from "../matching/matcher.js";
import { limitMatchesForPitch } from "./preferences.js";
import { formatAed } from "../matching/normalize.js";

/**
 * Project-led matching: try exact buyer criteria first, then useful softenings.
 * Always returns only inventory matches (confirmed rows). Soft preferences only rank.
 */
export function resolveMatches(catalog, buyer) {
  const base = criteriaFromBuyer(buyer);
  const attempts = [
    { mode: "exact", criteria: base, relaxed: [] },
    {
      mode: "without_bedrooms",
      criteria: { ...base, bedrooms: null, propertyType: null },
      relaxed: ["bedrooms"]
    },
    {
      mode: "without_cash",
      criteria: { ...base, cashAvailableAed: null },
      relaxed: ["cash"]
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
      },
      relaxed: ["bedrooms", "cash", "payment_plan"]
    }
  ];

  const seen = new Set();
  for (const attempt of attempts) {
    const key = JSON.stringify(attempt.criteria);
    if (seen.has(key)) continue;
    seen.add(key);

    if (!canPitchWithCriteria(attempt.criteria)) continue;

    const result = matchInventory(catalog, attempt.criteria);
    if (result.matchCount > 0) {
      const pitched = limitMatchesForPitch(result.matches);
      const mismatches = explainSoftMismatches(buyer, pitched, attempt.mode, attempt.relaxed);
      return {
        mode: attempt.mode,
        criteria: attempt.criteria,
        matches: pitched,
        matchCount: pitched.length,
        allMatches: result.matches,
        rejected: result.rejected,
        relaxed: attempt.relaxed,
        mismatches
      };
    }
  }

  return {
    mode: "none",
    criteria: base,
    matches: [],
    matchCount: 0,
    allMatches: [],
    rejected: [],
    relaxed: [],
    mismatches: []
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

function bedroomPhrase(beds) {
  if (beds === 0) return "studio";
  if (beds === 1) return "1 bedroom";
  return `${beds} bedroom`;
}

/**
 * Explicit gaps between what the buyer asked for and what a soft match offers.
 * Soft matches must never read like exact matches.
 */
export function explainSoftMismatches(buyer, matches, mode = "exact", relaxed = []) {
  if (mode === "exact" || !matches.length) return [];

  const notes = [];
  const wantedBeds = buyer.bedrooms?.[0];
  const offeredBeds = [...new Set(matches.map((row) => row.unit.bedrooms))].sort((a, b) => a - b);

  if (
    (relaxed.includes("bedrooms") || mode !== "exact") &&
    wantedBeds !== null &&
    wantedBeds !== undefined &&
    !offeredBeds.includes(wantedBeds)
  ) {
    const offered = offeredBeds.map(bedroomPhrase);
    const offeredText =
      offered.length === 1
        ? offered[0]
        : `${offered.slice(0, -1).join(", ")} and ${offered.at(-1)}`;
    notes.push(
      `You asked for ${bedroomPhrase(wantedBeds)}. This is not an exact match. The closest confirmed options here are ${offeredText}.`
    );
  } else if (
    wantedBeds !== null &&
    wantedBeds !== undefined &&
    offeredBeds.length &&
    !offeredBeds.every((beds) => beds === wantedBeds)
  ) {
    const other = offeredBeds.filter((beds) => beds !== wantedBeds).map(bedroomPhrase);
    if (other.length) {
      notes.push(
        `You asked for ${bedroomPhrase(wantedBeds)}. Some confirmed options nearby are ${other.join(" and ")}, so this is not an exact bedroom match.`
      );
    }
  }

  if (buyer.cashAvailableAed !== null && buyer.cashAvailableAed !== undefined) {
    const cashGaps = matches
      .map((row) => ({
        project: row.project.name,
        down: row.downPaymentAed
      }))
      .filter((row) => row.down !== null && row.down !== undefined && row.down > buyer.cashAvailableAed);

    if (cashGaps.length) {
      const sample = cashGaps[0];
      notes.push(
        `You have ${formatAed(buyer.cashAvailableAed)} available now. ${sample.project} needs ${formatAed(sample.down)} initially, so the cash available does not match.`
      );
    }
  }

  if (buyer.financing === "payment_plan") {
    const noPlan = matches.filter((row) => !row.project.paymentPlanAvailable);
    if (noPlan.length) {
      notes.push(
        `You asked for a payment plan. ${noPlan[0].project.name} does not have a confirmed payment plan in the list.`
      );
    }
  }

  if (buyer.budgetAed !== null && buyer.budgetAed !== undefined) {
    const overBudget = matches.filter(
      (row) =>
        row.unit.startingPriceAed !== null &&
        row.unit.startingPriceAed !== undefined &&
        row.unit.startingPriceAed > buyer.budgetAed
    );
    if (overBudget.length) {
      notes.push(
        `You set a budget of ${formatAed(buyer.budgetAed)}. ${overBudget[0].project.name} starts at ${formatAed(overBudget[0].unit.startingPriceAed)}, so the budget does not match.`
      );
    }
  }

  return [...new Set(notes)];
}
