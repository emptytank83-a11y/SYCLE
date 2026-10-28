"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { scoreEvidenceBundle } = require("../scoring");

const config = {
  version: 1, expert_review: "pending",
  pillar_weights: { workers: 0.4, society: 0.6 },
  indicators: {
    injury: { pillar: "workers", subcategory: "health", weight: 1, normalisation: { type: "minmax", min: 0, max: 10, direction: "lower_is_better" } },
    governance: { pillar: "society", subcategory: "governance", weight: 1, normalisation: { type: "minmax", min: 0, max: 100, direction: "higher_is_better" } },
  },
};
const bundle = { indicators: [
  { indicator_id: "injury", evidence_id: "ev-injury", value: 2, confidence: "H" },
  { indicator_id: "governance", evidence_id: "ev-governance", value: 70, confidence: "M" },
] };

test("identical evidence produces identical deterministic output", () => {
  assert.deepEqual(scoreEvidenceBundle(bundle, config), scoreEvidenceBundle(bundle, config));
});

test("overall recomputes exactly from pillar traces and weights", () => {
  const result = scoreEvidenceBundle(bundle, config);
  const recomputed = result.trace.pillars.reduce((sum, pillar) => sum + pillar.score * pillar.weight, 0) /
    result.trace.pillars.reduce((sum, pillar) => sum + pillar.weight, 0);
  assert.equal(result.overall, recomputed);
  assert.deepEqual(result.pillars, { workers: 80, society: 70 });
  assert.equal(result.overall, 74);
  assert.equal(result.activity_weighting, "unweighted");
  assert.ok(result.sensitivity.min < result.overall);
  assert.ok(result.sensitivity.max > result.overall);
});
