"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryEvidenceRepository } = require("../storage");
const { getRule, RULE_KEYS } = require("../rules");
const { seedUSStateRules } = require("../rules/seed-us-state-rules");

function stateRecords() {
  return Array.from({ length: 51 }, (_, index) => ({
    id: `US-S${String(index + 1).padStart(2, "0")}`,
    name: `Recorded subdivision ${index + 1}`,
    level: "state",
    parent_id: "US",
  }));
}

test("state seed contains seven null unverified rules for 50 states plus DC", () => {
  const rules = seedUSStateRules(stateRecords());
  assert.equal(rules.length, 51 * RULE_KEYS.length);
  assert.ok(rules.every((rule) => rule.rule_value === null && rule.verified === false && rule.source_url.startsWith("https://")));
});

test("unverified jurisdiction values are never returned", () => {
  const geos = [
    { id: "US", name: "United States", level: "country", parent_id: null },
    { id: "US-NY", name: "New York", level: "state", parent_id: "US" },
  ];
  const repo = new MemoryEvidenceRepository({ geography: geos });
  repo.insert("jurisdiction_rule", {
    id: "draft-rule", geography_id: "US-NY", rule_key: "paid_sick_leave",
    rule_value: "fixture-value", effective_from: null,
    source_url: "https://example.test/authority", verified: false,
    verified_by: null, verified_at: null,
  });
  assert.equal(getRule(repo, [...geos].reverse(), "paid_sick_leave").status, "gap");
});

test("lookup returns most-specific verified rule", () => {
  const geos = [
    { id: "US", name: "United States", level: "country", parent_id: null },
    { id: "US-NY", name: "New York", level: "state", parent_id: "US" },
  ];
  const repo = new MemoryEvidenceRepository({ geography: geos });
  for (const [id, geography_id, value] of [["national", "US", "national-fixture"], ["state", "US-NY", "state-fixture"]]) {
    repo.insert("jurisdiction_rule", {
      id, geography_id, rule_key: "paid_sick_leave", rule_value: value,
      effective_from: "2026-01-01", source_url: "https://example.test/authority",
      verified: true, verified_by: "test fixture", verified_at: "2026-01-02T00:00:00Z",
    });
  }
  const result = getRule(repo, [geos[1], geos[0]], "paid_sick_leave");
  assert.equal(result.geography_id, "US-NY");
  assert.equal(result.rule.rule_value, "state-fixture");
});
