"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryEvidenceRepository } = require("../storage");

const source = {
  id: "src-test", name: "Recorded test source", publisher: "Test publisher",
  url: "https://example.test/source", licence: null,
  licence_commercial_ok: null, update_cadence: "test fixture",
};

test("repository validates and preserves immutable source versions", () => {
  const repo = new MemoryEvidenceRepository();
  const stored = repo.insert("source", source);
  assert.equal(stored.id, source.id);
  assert.throws(() => { stored.name = "changed"; }, TypeError);
  assert.throws(() => repo.insert("source", source), /immutable/);
});

test("evidence lookup respects geography and sector", () => {
  const repo = new MemoryEvidenceRepository();
  repo.insert("source", source);
  repo.insert("source_version", {
    id: "sv-test", source_id: source.id, edition: "fixture-v1",
    ingested_at: "2026-01-01T00:00:00Z", checksum: "fixture-checksum",
  });
  repo.insert("geography", { id: "US-NY", name: "New York", level: "state", parent_id: "US" });
  repo.insert("indicator", {
    id: "injury-rate", name: "Injury rate", unit: "cases per 100 FTE",
    direction: "lower_is_better", unep_stakeholder: "Workers", unep_subcategory: "Health and safety",
  });
  repo.insert("evidence", {
    id: "ev-test", indicator_id: "injury-rate", geography_id: "US-NY",
    sector_code: "3361", value: 1.23, value_text: null,
    source_version_id: "sv-test", geo_level_used: "state", is_fallback: false,
    confidence: "H", notes: "Synthetic recorded fixture; not production evidence",
  });
  assert.equal(repo.findEvidence({ indicator_id: "injury-rate", geography_ids: ["US-NY"], sector_code: "3361" }).length, 1);
  assert.equal(repo.findEvidence({ indicator_id: "injury-rate", geography_ids: ["US-TX"], sector_code: "3361" }).length, 0);
});
