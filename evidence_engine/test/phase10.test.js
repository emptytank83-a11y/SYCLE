"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryEvidenceRepository } = require("../storage");
const { runEvidencePipeline } = require("../pipeline");
const { adaptEvidenceV2ToLegacy } = require("../adapter");
const { compareGolden } = require("../golden");
const { exportMethodology } = require("../methodology");
const { loadLegacyRuntime } = require("./legacy-harness");

const catalogue = { version: 1, expert_review: "pending", fallback: { order: ["state", "country"], confidence_downgrade_per_step: 1 }, stakeholders: [
  { id: "workers", subcategories: [{ id: "health", indicators: [{ id: "injury", unit: "rate", direction: "lower_is_better", candidate_sources: [{ source_id: "official", geo_level: "state", rank: 1 }] }] }] },
  { id: "local_communities", subcategories: [{ id: "gap", indicators: [{ id: "community_gap", unit: "index", direction: "higher_is_better", candidate_sources: [] }] }] },
  { id: "society", subcategories: [{ id: "gap", indicators: [{ id: "society_gap", unit: "index", direction: "higher_is_better", candidate_sources: [] }] }] },
  { id: "consumers", subcategories: [{ id: "gap", indicators: [{ id: "consumer_gap", unit: "index", direction: "higher_is_better", candidate_sources: [] }] }] },
  { id: "value_chain_actors", subcategories: [{ id: "gap", indicators: [{ id: "chain_gap", unit: "index", direction: "higher_is_better", candidate_sources: [] }] }] },
  { id: "children", subcategories: [{ id: "gap", indicators: [{ id: "children_gap", unit: "index", direction: "higher_is_better", candidate_sources: [] }] }] },
] };
const scoringConfig = { version: 1, expert_review: "pending", pillar_weights: { workers: 1 }, indicators: {
  injury: { pillar: "workers", subcategory: "health", weight: 1, normalisation: { type: "minmax", min: 0, max: 10, direction: "lower_is_better" } },
} };

function repoFixture() {
  const repo = new MemoryEvidenceRepository();
  repo.insert("geography", { id: "US", name: "United States", level: "country", parent_id: null });
  repo.insert("geography", { id: "US-NY", name: "New York", level: "state", parent_id: "US" });
  repo.insert("source", { id: "official", name: "Official fixture", publisher: "Fixture", url: "https://example.test/official", licence: null, licence_commercial_ok: null, update_cadence: null });
  repo.insert("source_version", { id: "official-v1", source_id: "official", edition: "fixture", ingested_at: "2026-01-01T00:00:00Z", checksum: "official-checksum" });
  repo.insert("indicator", { id: "injury", name: "Injury", unit: "rate", direction: "lower_is_better", unep_stakeholder: "Workers", unep_subcategory: "Health" });
  repo.insert("evidence", { id: "ev-injury", indicator_id: "injury", geography_id: "US-NY", sector_code: "336110", value: 2, value_text: null, source_version_id: "official-v1", geo_level_used: "state", is_fallback: false, confidence: "H", notes: "Synthetic fixture" });
  return repo;
}

test("pipeline stamps versions and produces validated evidence_v2", async () => {
  const repo = repoFixture();
  const result = await runEvidencePipeline({ product: "passenger car", sector_code: "336110", location: "New York State", hs_codes: [], key_minerals: [] },
    { repo, catalogue, scoringConfig, generatedAt: "2026-01-01T00:00:00Z" });
  assert.equal(result.status, "complete");
  assert.equal(result.evidence_v2.scores.overall, 80);
  assert.equal(result.evidence_v2.data_versions[0].checksum, "official-checksum");
  assert.equal(result.evidence_v2.validation.valid, true);
});

test("ambiguous geography stops for clarification", async () => {
  const repo = repoFixture();
  repo.insert("geography", { id: "US-PLACE-51000", name: "New York", level: "site", parent_id: "US-NY" });
  const result = await runEvidencePipeline({ product: "passenger car", sector_code: "336110", location: "New York" }, { repo, catalogue, scoringConfig });
  assert.equal(result.status, "needs_clarification");
  assert.equal(result.questions[0].id, "geography");
});

test("legacy adapter reuses existing PDF report renderer", () => {
  const runtime = loadLegacyRuntime();
  const legacy = runtime.buildReport("Car manufacturing, 4,000 units/year, New York, United States", { id: "pdf" });
  legacy.evidence_v2 = { scores: { overall: 80, pillars: { workers: 80 } }, bundle: { references: [] }, narrative: { sections: [] } };
  const adapted = adaptEvidenceV2ToLegacy(legacy, { enabled: true });
  const html = runtime.reportHTML(adapted);
  assert.match(html, /Overall Social Score/);
  assert.match(html, />80</);
});

test("golden harness fails score drift or validator regression", () => {
  assert.equal(compareGolden({ scores: { overall: 80 }, validator_pass_rate: 1 }, { scores: { overall: 80 }, validator_pass_rate: 1 }).pass, true);
  assert.equal(compareGolden({ scores: { overall: 77 }, validator_pass_rate: .5 }, { scores: { overall: 80 }, validator_pass_rate: 1 }, { scoreTolerance: 1 }).pass, false);
});

test("methodology export contains weights, fallbacks, and versions", () => {
  const markdown = exportMethodology(catalogue, scoringConfig, [{ id: "official-v1", edition: "fixture", checksum: "official-checksum" }]);
  assert.match(markdown, /Geography fallback/);
  assert.match(markdown, /workers: 1/);
  assert.match(markdown, /official-checksum/);
});
