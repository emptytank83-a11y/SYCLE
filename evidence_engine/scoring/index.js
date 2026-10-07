"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CONFIDENCE_SPREAD = Object.freeze({ H: 5, M: 10, L: 20 });

function clamp(value, min = 0, max = 100) { return Math.min(max, Math.max(min, value)); }
function weightedMean(items) {
  const denominator = items.reduce((sum, item) => sum + item.weight, 0);
  return denominator ? items.reduce((sum, item) => sum + item.value * item.weight, 0) / denominator : null;
}

function normalise(value, method) {
  if (!Number.isFinite(value)) return null;
  if (method.type === "minmax") {
    if (method.max === method.min) throw new Error("Normalisation min and max cannot match");
    const ratio = clamp((value - method.min) / (method.max - method.min), 0, 1);
    return clamp((method.direction === "lower_is_better" ? 1 - ratio : ratio) * 100);
  }
  if (method.type === "boolean") {
    return Boolean(value) === Boolean(method.preferred) ? 100 : 0;
  }
  throw new Error(`Unsupported normalisation method: ${method.type}`);
}

function loadScoringConfig(file = path.join(__dirname, "config.json")) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  if (config.version !== 1 || config.expert_review !== "pending") throw new Error("Scoring config must be version 1 and pending expert review");
  const weightSum = Object.values(config.pillar_weights).reduce((sum, value) => sum + value, 0);
  if (Math.abs(weightSum - 1) > 1e-9) throw new Error("Pillar weights must sum to 1");
  return config;
}

function rollup(bundle, config, scoreMode = "base", weightMode = "base", activityWeights = null) {
  const indicatorTrace = [];
  for (const evidence of bundle.indicators) {
    const definition = config.indicators[evidence.indicator_id];
    if (!definition || !Number.isFinite(evidence.value)) continue;
    const base = normalise(evidence.value, definition.normalisation);
    const spread = CONFIDENCE_SPREAD[evidence.confidence] ?? 20;
    const value = scoreMode === "low" ? clamp(base - spread) : scoreMode === "high" ? clamp(base + spread) : base;
    const activityWeight = activityWeights?.[evidence.evidence_id] ?? 1;
    indicatorTrace.push({
      indicator_id: evidence.indicator_id,
      evidence_id: evidence.evidence_id,
      input_value: evidence.value,
      normalised_score: value,
      base_normalised_score: base,
      confidence: evidence.confidence,
      indicator_weight: definition.weight,
      activity_weight: activityWeight,
      subcategory: definition.subcategory,
      pillar: definition.pillar,
      normalisation: definition.normalisation,
    });
  }
  const subcategoryTrace = [];
  const subcategoryKeys = new Set(indicatorTrace.map((item) => `${item.pillar}:${item.subcategory}`));
  for (const key of subcategoryKeys) {
    const [pillar, subcategory] = key.split(":");
    const members = indicatorTrace.filter((item) => item.pillar === pillar && item.subcategory === subcategory);
    const score = weightedMean(members.map((item) => ({ value: item.normalised_score, weight: item.indicator_weight * item.activity_weight })));
    subcategoryTrace.push({ pillar, subcategory, score, evidence_ids: members.map((item) => item.evidence_id), inputs: members });
  }
  const pillarTrace = [];
  for (const [pillar, baseWeight] of Object.entries(config.pillar_weights)) {
    const members = subcategoryTrace.filter((item) => item.pillar === pillar && Number.isFinite(item.score));
    if (!members.length) continue;
    const score = weightedMean(members.map((item) => ({ value: item.score, weight: 1 })));
    pillarTrace.push({ pillar, score, base_weight: baseWeight, weight: baseWeight, subcategories: members });
  }
  const average = pillarTrace.length ? pillarTrace.reduce((sum, item) => sum + item.score, 0) / pillarTrace.length : 0;
  for (const pillar of pillarTrace) {
    if (weightMode === "low") pillar.weight *= pillar.score <= average ? 1.2 : 0.8;
    if (weightMode === "high") pillar.weight *= pillar.score >= average ? 1.2 : 0.8;
  }
  const overall = weightedMean(pillarTrace.map((item) => ({ value: item.score, weight: item.weight })));
  return { indicatorTrace, subcategoryTrace, pillarTrace, overall };
}

function scoreEvidenceBundle(bundle, config = loadScoringConfig(), { activityWeights = null } = {}) {
  const base = rollup(bundle, config, "base", "base", activityWeights);
  const low = rollup(bundle, config, "low", "low", activityWeights);
  const high = rollup(bundle, config, "high", "high", activityWeights);
  const pillars = Object.fromEntries(base.pillarTrace.map((item) => [item.pillar, Number(item.score.toFixed(6))]));
  return {
    pillars,
    overall: base.overall == null ? null : Number(base.overall.toFixed(6)),
    sensitivity: {
      min: low.overall == null ? null : Number(low.overall.toFixed(6)),
      max: high.overall == null ? null : Number(high.overall.toFixed(6)),
      weight_variation: "plus_or_minus_20_percent",
      confidence_ranges_applied: true,
    },
    activity_weighting: activityWeights ? "worker_hour_weighted" : "unweighted",
    trace: {
      indicators: base.indicatorTrace,
      subcategories: base.subcategoryTrace,
      pillars: base.pillarTrace,
      formula: "weighted_mean(pillar_score, available_pillar_weight)",
    },
    methodology: { version: config.version, expert_review: config.expert_review },
  };
}

module.exports = { CONFIDENCE_SPREAD, loadScoringConfig, normalise, scoreEvidenceBundle, weightedMean };
