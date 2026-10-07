"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { attachEvidenceV2, loadConfig } = require("..");
const { loadLegacyGenerator } = require("./legacy-harness");

const STYLE = {
  name: "snapshot",
  voice: "snapshot",
  open: "Snapshot",
  link: "Snapshot",
};

const CASES = [
  {
    prompt: "Car manufacturing, 4,000 units/year, New York, United States",
    expected: {
      sectorKey: "automotive",
      country: "United States",
      region: "New York",
      qty: 4000,
      product: "Car",
    },
  },
  {
    prompt: "Lithium battery factory producing 10,000 units/year in Germany",
    expected: {
      sectorKey: "ev_battery",
      country: "Germany",
      region: "",
      qty: 10000,
      product: "Lithium battery",
    },
  },
  {
    prompt: "Coffee plantation producing 800 tonnes/year in Brazil",
    expected: {
      sectorKey: "food",
      country: "Brazil",
      region: "",
      qty: 800,
      product: "Coffee plantation",
    },
  },
];

test("feature flag defaults to false", () => {
  assert.equal(loadConfig({}).enabled, false);
  const legacy = { id: "legacy", scores: { overall: 50 } };
  assert.equal(attachEvidenceV2(legacy, { version: 2 }, {}), legacy);
  assert.deepEqual(
    attachEvidenceV2(legacy, { version: 2 }, { EVIDENCE_ENGINE_ENABLED: "true" }),
    { ...legacy, evidence_v2: { version: 2 } },
  );
});

for (const { prompt, expected } of CASES) {
  test(`legacy report snapshot: ${prompt}`, () => {
    const buildReport = loadLegacyGenerator();
    const report = buildReport(prompt, { id: "snapshot", style: STYLE });
    const snapshot = {
      sectorKey: report.sectorKey,
      country: report.country,
      region: report.region,
      qty: report.qty,
      product: report.product,
    };
    assert.deepEqual(snapshot, expected);
    assert.equal(Object.hasOwn(report, "evidence_v2"), false);
  });
}
