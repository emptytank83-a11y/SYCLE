"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { narrate } = require("../narrator");
const { validateReport } = require("../validator");

const bundle = {
  geography: { names: ["New York", "United States"], known_names: ["New York", "United States", "Texas"] },
  indicators: [
    { indicator_id: "injury", evidence_id: "ev-ny", value: 2, is_fallback: false },
    { indicator_id: "governance", evidence_id: "ev-us", value: 70, is_fallback: true },
  ], sourcing: [], references: [],
};
const scores = { pillars: { workers: 80 }, overall: 80 };

test("narrator drops invented numbers, wrong state, and implicit fallbacks", async () => {
  const llmClient = { async generate() { return { sections: [{ id: "summary", title: "Summary", sentences: [
    { text: "The injury value is 2.", support_ids: ["ev-ny"] },
    { text: "The injury value is 99.", support_ids: ["ev-ny"] },
    { text: "Texas has an injury value of 2.", support_ids: ["ev-ny"] },
    { text: "Governance is 70.", support_ids: ["ev-us"] },
    { text: "United States figure used; no New York data available. Governance is 70.", support_ids: ["ev-us"] },
  ] }] }; } };
  const result = await narrate(bundle, scores, { llmClient });
  assert.deepEqual(result.sections[0].sentences.map((item) => item.text), [
    "The injury value is 2.",
    "United States figure used; no New York data available. Governance is 70.",
  ]);
  assert.deepEqual(new Set(result.findings.map((item) => item.code)), new Set(["invented_number", "wrong_geography", "implicit_fallback"]));
});

test("legacy validator catches leaked geography and score mismatch", () => {
  const report = {
    country: "United States", region: "New York",
    scores: { worker: 80, humanRights: 70, community: 60, supplyChain: 50, governance: 90, consumer: 80, overall: 99 },
    model: { workerAnalysis: "Texas law applies", references: [{ name: "Source", url: "" }] },
  };
  const result = validateReport(report, { knownGeographies: ["New York", "Texas", "United States"] });
  assert.ok(result.findings.some((item) => item.code === "foreign_geography" && item.geography === "Texas"));
  assert.ok(result.findings.some((item) => item.code === "score_mismatch"));
  assert.ok(result.findings.some((item) => item.code === "placeholder_reference"));
});
