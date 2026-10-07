"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryEvidenceRepository } = require("../storage");
const { resolveGeography } = require("../geography");

function repository() {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "geographies.json"), "utf8"));
  return new MemoryEvidenceRepository({ geography: fixture.records });
}

test("New York returns ambiguous state and city candidates", () => {
  const result = resolveGeography("New York", repository());
  assert.equal(result.ambiguity, true);
  assert.deepEqual(new Set(result.candidates.map((item) => item.geography.id)), new Set(["US-NY", "US-PLACE-51000"]));
});

test("Albany, NY resolves to county, state, country chain", () => {
  const result = resolveGeography("Albany, NY", repository());
  assert.equal(result.ambiguity, false);
  assert.deepEqual(result.chain.map((geo) => geo.id), ["US-NY-001", "US-NY", "US"]);
});

test("Texas resolves to US-TX", () => {
  const result = resolveGeography("Texas", repository());
  assert.equal(result.ambiguity, false);
  assert.equal(result.geography.id, "US-TX");
  assert.deepEqual(result.chain.map((geo) => geo.id), ["US-TX", "US"]);
});
