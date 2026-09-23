import { formatAed, normalizeArea, normalizeDeveloper, normalizePropertyType, sameText } from "../matching/normalize.js";

const TIER_RANK = {
  exact: 3,
  strong_with_compromise: 2,
  nearby: 1,
  poor: 0
};

const WEIGHTS = {
  area: 24,
  bedrooms: 18,
  property_type: 10,
  budget: 24,
  cash: 14,
  payment_plan: 10
};

function initialPayment(project, unit) {
  if (unit.initialPaymentAed !== null && unit.initialPaymentAed !== undefined) {
    return unit.initialPaymentAed;
  }
  if (project.initialPaymentAed !== null && project.initialPaymentAed !== undefined) {
    return project.initialPaymentAed;
  }
  return null;
}

function bedroomPhrase(value) {
  if (value === 0) return "studio";
  if (value === 1) return "1 bedroom";
  return `${value} bedrooms`;
}

function bedroomRequest(values) {
  const labels = values.map(bedroomPhrase);
  if (labels.length <= 1) return labels[0] || null;
  return `${labels.slice(0, -1).join(", ")} or ${labels.at(-1)}`;
}

function dimension(key, status, weight, details = {}) {
  return { key, status, weight, ...details };
}

function activeCandidate(catalog, unit) {
  const project = catalog.projects.find((row) => row.id === unit.projectId);
  if (!project || !project.active || !project.developerActive || !unit.active) return null;
  return {
    project,
    unit,
    downPaymentAed: initialPayment(project, unit),
    bedroomLabel: bedroomPhrase(unit.bedrooms)
  };
}

function requestedBedrooms(buyer) {
  return [...(buyer.bedrooms || [])]
    .map(Number)
    .filter((value) => Number.isFinite(value));
}

function assessDimensions(candidate, buyer) {
  const { project, unit, downPaymentAed } = candidate;
  const dimensions = [];
  const wantedArea = buyer.preferredAreas?.[0] || null;
  const wantedBeds = requestedBedrooms(buyer);
  const wantedType = buyer.propertyTypes?.[0] || null;

  if (wantedArea) {
    const matched = sameText(project.area, normalizeArea(wantedArea));
    dimensions.push(
      dimension("area", matched ? "matched" : "mismatch", WEIGHTS.area, {
        requested: normalizeArea(wantedArea),
        offered: project.area,
        core: true
      })
    );
  }

  if (wantedBeds.length) {
    const matched = wantedBeds.includes(Number(unit.bedrooms));
    dimensions.push(
      dimension("bedrooms", matched ? "matched" : "mismatch", WEIGHTS.bedrooms, {
        requested: wantedBeds,
        offered: unit.bedrooms,
        core: true
      })
    );
  }

  // "Studio" is represented by bedrooms = 0 as well as property type. Count it
  // once so the score and explanation do not duplicate the same requirement.
  const studioAlreadyRepresented =
    normalizePropertyType(wantedType) === "studio" && wantedBeds.includes(0);
  if (wantedType && !studioAlreadyRepresented) {
    const normalized = normalizePropertyType(wantedType);
    const matched =
      normalized === "studio"
        ? unit.bedrooms === 0
        : sameText(unit.propertyType, normalized);
    dimensions.push(
      dimension("property_type", matched ? "matched" : "mismatch", WEIGHTS.property_type, {
        requested: normalized,
        offered: unit.propertyType,
        core: true
      })
    );
  }

  if (buyer.budgetAed !== null && buyer.budgetAed !== undefined) {
    let status = "matched";
    if (unit.startingPriceAed === null || unit.startingPriceAed === undefined) status = "unknown";
    else if (unit.startingPriceAed > buyer.budgetAed) status = "mismatch";
    dimensions.push(
      dimension("budget", status, WEIGHTS.budget, {
        requested: buyer.budgetAed,
        offered: unit.startingPriceAed,
        core: true,
        ratio:
          status === "mismatch" && buyer.budgetAed > 0
            ? unit.startingPriceAed / buyer.budgetAed
            : 1
      })
    );
  }

  if (buyer.cashAvailableAed !== null && buyer.cashAvailableAed !== undefined) {
    let status = "matched";
    if (downPaymentAed === null || downPaymentAed === undefined) status = "unknown";
    else if (downPaymentAed > buyer.cashAvailableAed) status = "mismatch";
    dimensions.push(
      dimension("cash", status, WEIGHTS.cash, {
        requested: buyer.cashAvailableAed,
        offered: downPaymentAed,
        core: false
      })
    );
  }

  if (buyer.financing === "payment_plan") {
    const status =
      project.paymentPlanAvailable === true
        ? "matched"
        : project.paymentPlanAvailable === false
          ? "mismatch"
          : "unknown";
    dimensions.push(
      dimension("payment_plan", status, WEIGHTS.payment_plan, {
        requested: true,
        offered: project.paymentPlanAvailable,
        core: false
      })
    );
  }

  return dimensions;
}

function matchedReason(candidate, dimension) {
  if (dimension.key === "area") return `your ${dimension.offered} area`;
  if (dimension.key === "bedrooms") {
    return dimension.offered === 0
      ? "your studio requirement"
      : `your ${dimension.offered}-bedroom requirement`;
  }
  if (dimension.key === "property_type") return `your ${dimension.offered} preference`;
  if (dimension.key === "budget") return `your ${formatAed(dimension.requested)} budget`;
  if (dimension.key === "cash") return `your ${formatAed(dimension.requested)} initial cash`;
  if (dimension.key === "payment_plan") return "your payment-plan preference";
  return null;
}

function compromiseReason(candidate, dimension) {
  const name = candidate.project.name;
  if (dimension.key === "area") {
    return {
      key: "area",
      core: true,
      text: `You preferred ${dimension.requested}; ${name} is in ${dimension.offered}.`
    };
  }
  if (dimension.key === "bedrooms") {
    return {
      key: "bedrooms",
      core: true,
      text: `You asked for ${bedroomRequest(dimension.requested)}; this option is ${bedroomPhrase(dimension.offered)}.`
    };
  }
  if (dimension.key === "property_type") {
    return {
      key: "property_type",
      core: true,
      text: `You asked for a ${dimension.requested}; this option is a ${dimension.offered}.`
    };
  }
  if (dimension.key === "budget") {
    const text =
      dimension.status === "unknown"
        ? `The starting price for ${name} is not confirmed yet.`
        : `${name} starts at ${formatAed(dimension.offered)}, above your ${formatAed(dimension.requested)} budget.`;
    return { key: "budget", core: true, text };
  }
  if (dimension.key === "cash") {
    const text =
      dimension.status === "unknown"
        ? `The initial payment for ${name} is not confirmed yet.`
        : `${name} needs ${formatAed(dimension.offered)} initially, above the ${formatAed(dimension.requested)} you want to put down.`;
    return { key: "cash", core: false, text };
  }
  if (dimension.key === "payment_plan") {
    return {
      key: "payment_plan",
      core: false,
      text:
        dimension.status === "unknown"
          ? `A developer payment plan is not confirmed yet for ${name}.`
          : `A developer payment plan is not confirmed for ${name}.`
    };
  }
  return null;
}

function classify(dimensions, buyer) {
  const gaps = dimensions.filter((row) => row.status !== "matched");
  if (!gaps.length) return "exact";

  const coreGaps = gaps.filter((row) => row.core);
  const financeGaps = gaps.filter((row) => !row.core);
  const areaFlexible =
    Boolean(buyer.openToOtherAreas) ||
    (buyer.intentSignals || []).includes("area_flexible");
  const strictAreaGap = coreGaps.some((row) => row.key === "area") && !areaFlexible;
  const severeBudget = coreGaps.some(
    (row) => row.key === "budget" && row.status === "mismatch" && row.ratio > 1.2
  );

  if (!coreGaps.length && financeGaps.length) return "strong_with_compromise";
  if (coreGaps.length === 1 && !strictAreaGap && !severeBudget) return "nearby";
  return "poor";
}

function scoreDimensions(dimensions) {
  if (!dimensions.length) return 100;
  const possible = dimensions.reduce((sum, row) => sum + row.weight, 0);
  const earned = dimensions.reduce((sum, row) => {
    if (row.status === "matched") return sum + row.weight;
    if (row.status === "unknown" && !row.core) return sum + row.weight * 0.25;
    return sum;
  }, 0);
  return Math.round((earned / possible) * 100);
}

function distancePenalty(dimensions) {
  return dimensions.reduce((sum, row) => {
    if (row.status === "matched") return sum;
    if (row.status === "unknown") return sum + (row.core ? 25 : 5);
    if (row.key === "bedrooms") {
      const requested = Array.isArray(row.requested) ? row.requested : [row.requested];
      const distance = Math.min(...requested.map((value) => Math.abs(Number(value) - Number(row.offered))));
      return sum + distance * 10;
    }
    if (row.key === "budget" && row.requested > 0 && row.offered !== null) {
      return sum + Math.max(0, ((row.offered - row.requested) / row.requested) * 100);
    }
    if (row.key === "cash" && row.requested > 0 && row.offered !== null) {
      return sum + Math.max(0, ((row.offered - row.requested) / row.requested) * 10);
    }
    if (row.key === "area") return sum + 20;
    if (row.key === "property_type") return sum + 15;
    if (row.key === "payment_plan") return sum + 5;
    return sum + 10;
  }, 0);
}

export function assessCandidate(candidate, buyer) {
  const dimensions = assessDimensions(candidate, buyer);
  const tier = classify(dimensions, buyer);
  const matched = dimensions
    .filter((row) => row.status === "matched")
    .map((row) => matchedReason(candidate, row))
    .filter(Boolean);
  const compromises = dimensions
    .filter((row) => row.status !== "matched")
    .map((row) => compromiseReason(candidate, row))
    .filter(Boolean);

  return {
    ...candidate,
    fit: {
      tier,
      tierRank: TIER_RANK[tier],
      score: scoreDimensions(dimensions),
      distancePenalty: Math.round(distancePenalty(dimensions) * 100) / 100,
      dimensions,
      matched,
      compromises,
      coreGapCount: compromises.filter((row) => row.core).length,
      financeGapCount: compromises.filter((row) => !row.core).length
    }
  };
}

export function assessInventory(catalog, buyer) {
  const requestedProject = buyer.projectInterest || null;
  const requestedDeveloper = buyer.developerInterest || null;
  const assessments = [];

  for (const unit of catalog.units) {
    const candidate = activeCandidate(catalog, unit);
    if (!candidate) continue;
    if (buyer.preferredEmirate && !sameText(candidate.project.emirate, buyer.preferredEmirate)) continue;
    if (
      requestedProject &&
      !sameText(candidate.project.name, requestedProject) &&
      !candidate.project.name.toLowerCase().includes(String(requestedProject).toLowerCase())
    ) {
      continue;
    }
    if (
      requestedDeveloper &&
      !sameText(candidate.project.developerName, normalizeDeveloper(requestedDeveloper))
    ) {
      continue;
    }
    assessments.push(assessCandidate(candidate, buyer));
  }

  assessments.sort((a, b) => {
    if (a.fit.tierRank !== b.fit.tierRank) return b.fit.tierRank - a.fit.tierRank;
    if (a.fit.score !== b.fit.score) return b.fit.score - a.fit.score;
    if (a.fit.compromises.length !== b.fit.compromises.length) {
      return a.fit.compromises.length - b.fit.compromises.length;
    }
    if (a.fit.distancePenalty !== b.fit.distancePenalty) {
      return a.fit.distancePenalty - b.fit.distancePenalty;
    }
    const priceA = a.unit.startingPriceAed ?? Number.MAX_SAFE_INTEGER;
    const priceB = b.unit.startingPriceAed ?? Number.MAX_SAFE_INTEGER;
    return priceA - priceB;
  });
  return assessments;
}

export function bestRecommendableTier(assessments) {
  return assessments.find((row) => row.fit.tier !== "poor")?.fit.tier || "none";
}

export function isStrongFitTier(tier) {
  return tier === "exact" || tier === "strong_with_compromise";
}
