"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryEvidenceRepository } = require("../storage");
const { assembleEvidenceBundle } = require("../assembler");

function fixtureRepository() {
  const repo = new MemoryEvidenceRepository();
  for (const geo of [
    { id: "US", name: "United States", level: "country", parent_id: null },
    { id: "US-NY", name: "New York", level: "state", parent_id: "US" },
  ]) repo.insert("geography", geo);
  for (const id of ["bls_soii", "world_bank_wgi", "un_comtrade"]) {
    repo.insert("source", { id, name: id, publisher: "Recorded fixture", url: `https://example.test/${id}`, licence: null, licence_commercial_ok: null, update_cadence: null });
    repo.insert("source_version", { id: `${id}-v1`, source_id: id, edition: "fixture", ingested_at: "2026-01-01T00:00:00Z", checksum: `${id}-fixture-checksum` });
  }
  for (const indicator of [
    { id: "injury", name: "Injury", unit: "rate", direction: "lower_is_better", unep_stakeholder: "Workers", unep_subcategory: "Health" },
    { id: "governance", name: "Governance", unit: "index", direction: "higher_is_better", unep_stakeholder: "Society", unep_subcategory: "Governance" },
    { id: "trade_import_share", name: "Trade share", unit: "percent", direction: "contextual", unep_stakeholder: "Value chain actors", unep_subcategory: "Sourcing" },
  ]) repo.insert("indicator", indicator);
  repo.insert("evidence", { id: "ny-injury", indicator_id: "injury", geography_id: "US-NY", sector_code: "336110", value: 2, value_text: null, source_version_id: "bls_soii-v1", geo_level_used: "state", is_fallback: false, confidence: "H", notes: "Synthetic fixture" });
  repo.insert("evidence", { id: "us-governance", indicator_id: "governance", geography_id: "US", sector_code: null, value: 80, value_text: null, source_version_id: "world_bank_wgi-v1", geo_level_used: "country", is_fallback: false, confidence: "H", notes: "Synthetic fixture" });
  repo.insert("evidence", { id: "trade-fixture", indicator_id: "trade_import_share", geography_id: "US", sector_code: null, value: 31, value_text: null, source_version_id: "un_comtrade-v1", geo_level_used: "country", is_fallback: false, confidence: "H", notes: "Synthetic fixture", dimensions: { hs_code: "8703", country: "Fixtureland" } });
  return repo;
}

const catalogue = {
  fallback: { confidence_downgrade_per_step: 1 },
  stakeholders: [{ id: "workers", subcategories: [{ id: "health", indicators: [
    { id: "injury", unit: "rate", direction: "lower_is_better", candidate_sources: [{ source_id: "bls_soii", geo_level: "state", rank: 1 }] },
    { id: "missing", unit: "rate", direction: "lower_is_better", candidate_sources: [{ source_id: "bls_soii", geo_level: "state", rank: 1 }] },
    { id: "governance", unit: "index", direction: "higher_is_better", candidate_sources: [{ source_id: "world_bank_wgi", geo_level: "country", rank: 1 }] },
  ] }] }],
};

test("New York car bundle prefers NY evidence and labels US fallback", () => {
  const repo = fixtureRepository();
  const spec = { product: "passenger car", sector_code: "336110", hs_codes: ["8703"], key_minerals: [], geo_chain: [repo.get("geography", "US-NY"), repo.get("geography", "US")] };
  const bundle = assembleEvidenceBundle(spec, catalogue, repo);
  const injury = bundle.indicators.find((item) => item.indicator_id === "injury");
  const governance = bundle.indicators.find((item) => item.indicator_id === "governance");
  assert.equal(injury.geography_id, "US-NY");
  assert.equal(injury.is_fallback, false);
  assert.equal(governance.geography_id, "US");
  assert.equal(governance.is_fallback, true);
  assert.equal(governance.confidence, "M");
  assert.deepEqual(bundle.gaps.map((gap) => gap.indicator_id), ["missing"]);
  assert.deepEqual(bundle.sourcing.map((item) => item.country), ["Fixtureland"]);
  assert.equal(bundle.sourcing[0].share, 31);
});
