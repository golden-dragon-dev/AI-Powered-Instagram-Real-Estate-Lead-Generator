import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_PATH = path.join(ROOT, "data", "conversation-preferences.json");

let cached = null;
let cachedPath = null;

export function loadConversationPreferences(
  filePath = process.env.CONVERSATION_PREFERENCES_PATH || DEFAULT_PATH
) {
  if (cached && cachedPath === filePath) return cached;
  try {
    cached = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    cached = {
      maxProjectsToPitch: 2,
      maxUnitsPerProject: 3,
      featuredProjectIds: [],
      featuredProjectNames: []
    };
  }
  cachedPath = filePath;
  return cached;
}

export function clearPreferenceCache() {
  cached = null;
  cachedPath = null;
}

export function isFeaturedProject(project, prefs = loadConversationPreferences()) {
  const ids = new Set(prefs.featuredProjectIds || []);
  const names = new Set((prefs.featuredProjectNames || []).map((name) => String(name).toLowerCase()));
  if (ids.has(project.id)) return true;
  return names.has(String(project.name || "").toLowerCase());
}

/**
 * Soft ranking only. Matching stays in code; this only orders confirmed matches.
 */
export function rankMatches(matches, prefs = loadConversationPreferences()) {
  const copy = [...matches];
  copy.sort((a, b) => {
    const tierA = a.fit?.tierRank ?? 0;
    const tierB = b.fit?.tierRank ?? 0;
    if (tierA !== tierB) return tierB - tierA;
    const scoreA = a.fit?.score ?? 0;
    const scoreB = b.fit?.score ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;
    const gapsA = a.fit?.compromises?.length ?? 0;
    const gapsB = b.fit?.compromises?.length ?? 0;
    if (gapsA !== gapsB) return gapsA - gapsB;
    const distanceA = a.fit?.distancePenalty ?? 0;
    const distanceB = b.fit?.distancePenalty ?? 0;
    if (distanceA !== distanceB) return distanceA - distanceB;
    const featuredA = isFeaturedProject(a.project, prefs) ? 0 : 1;
    const featuredB = isFeaturedProject(b.project, prefs) ? 0 : 1;
    if (featuredA !== featuredB) return featuredA - featuredB;
    const priceA = a.unit.startingPriceAed ?? Number.MAX_SAFE_INTEGER;
    const priceB = b.unit.startingPriceAed ?? Number.MAX_SAFE_INTEGER;
    return priceA - priceB;
  });
  return copy;
}

export function limitMatchesForPitch(matches, prefs = loadConversationPreferences()) {
  const ranked = rankMatches(matches, prefs);
  const maxProjects = prefs.maxProjectsToPitch || 2;
  const maxUnits = prefs.maxUnitsPerProject || 3;
  const seenProjects = new Set();
  const selected = [];

  for (const match of ranked) {
    const projectId = match.project.id;
    const projectCount = [...seenProjects].length;
    if (!seenProjects.has(projectId) && projectCount >= maxProjects) continue;
    const unitsForProject = selected.filter((row) => row.project.id === projectId).length;
    if (unitsForProject >= maxUnits) continue;
    selected.push(match);
    seenProjects.add(projectId);
  }
  return selected;
}
