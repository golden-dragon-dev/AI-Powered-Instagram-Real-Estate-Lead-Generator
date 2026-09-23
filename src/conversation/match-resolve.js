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

  const flexibleArea =
    Boolean(buyer.openToOtherAreas) ||
    (buyer.intentSignals || []).includes("area_flexible");
  if (flexibleArea && base.budgetAed) {
    attempts.push({
      mode: "budget_only_flexible_area",
      criteria: {
        emirate: base.emirate,
        area: null,
        project: base.project,
        developer: base.developer,
        budgetAed: base.budgetAed,
        bedrooms: base.bedrooms,
        propertyType: base.propertyType,
        cashAvailableAed: base.cashAvailableAed,
        paymentPlanRequired: base.paymentPlanRequired
      },
      relaxed: ["area"]
    });
  }

  const seen = new Set();
  for (const attempt of attempts) {
    const key = JSON.stringify(attempt.criteria);
    if (seen.has(key)) continue;
    seen.add(key);

    const allowEmirateOnly = attempt.relaxed.includes("area");
    if (!canPitchWithCriteria(attempt.criteria, { allowEmirateOnly })) continue;

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

function canPitchWithCriteria(criteria, { allowEmirateOnly = false } = {}) {
  return Boolean(
    criteria.budgetAed &&
      (criteria.area ||
        criteria.project ||
        criteria.developer ||
        (allowEmirateOnly && criteria.emirate))
  );
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
  const wantedBeds = [...(buyer.bedrooms || [])].map(Number).filter((n) => Number.isFinite(n));
  const offeredBeds = [...new Set(matches.map((row) => row.unit.bedrooms))].sort((a, b) => a - b);
  const wantedPhrase = wantedBeds.map(bedroomPhrase).join(" or ");
  const overlap = wantedBeds.filter((beds) => offeredBeds.includes(beds));

  if (wantedBeds.length && offeredBeds.length && overlap.length === 0) {
    const offered = offeredBeds.map(bedroomPhrase);
    const offeredText =
      offered.length === 1
        ? offered[0]
        : `${offered.slice(0, -1).join(", ")} and ${offered.at(-1)}`;
    notes.push(
      `You asked for ${wantedPhrase}. This is not an exact match. The closest confirmed options here are ${offeredText}.`
    );
  } else if (wantedBeds.length > 1 && overlap.length && overlap.length < wantedBeds.length) {
    const missing = wantedBeds.filter((beds) => !offeredBeds.includes(beds)).map(bedroomPhrase);
    if (missing.length) {
      notes.push(
        `You asked for ${wantedPhrase}. Confirmed options here cover ${overlap.map(bedroomPhrase).join(" and ")}, but not ${missing.join(" and ")}.`
      );
    }
  } else if (
    wantedBeds.length === 1 &&
    offeredBeds.length &&
    !offeredBeds.every((beds) => beds === wantedBeds[0])
  ) {
    const other = offeredBeds.filter((beds) => beds !== wantedBeds[0]).map(bedroomPhrase);
    if (other.length) {
      notes.push(
        `You asked for ${bedroomPhrase(wantedBeds[0])}. Some confirmed options nearby are ${other.join(" and ")}, so this is not an exact bedroom match.`
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

  if (
    (relaxed.includes("area") || mode === "budget_only_flexible_area") &&
    buyer.preferredAreas?.length
  ) {
    const offeredAreas = [...new Set(matches.map((row) => row.project.area).filter(Boolean))];
    const wanted = buyer.preferredAreas[0];
    if (offeredAreas.length && !offeredAreas.includes(wanted)) {
      notes.push(
        `You leaned toward ${wanted}. These confirmed options are in ${offeredAreas.join(" and ")}, so the area does not match exactly.`
      );
    }
  }

  return [...new Set(notes)];
}
