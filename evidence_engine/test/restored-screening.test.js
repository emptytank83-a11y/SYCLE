"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadLegacyRuntime } = require("../comparison/legacy-runtime");

test("restored screening generator creates a complete structured report", () => {
  const runtime = loadLegacyRuntime();
  const report = runtime.buildReport(
    "Build an S-LCA for a car factory producing 4,000 vehicles annually in New York, United States",
  );

  assert.equal(report.product, "car");
  assert.equal(report.country, "United States");
  assert.equal(report.region, "New York");
  assert.equal(report.qty, 4000);
  assert.equal(report.generationMode, "screening");
  assert.ok(report.supplyChain.stages.length > 0);
  assert.ok(report.model.reportSections.includes("Recommendations"));
  assert.match(runtime.reportHTML(report), /Overall Social Score/);
});

test("a sugar report never inherits the coffee supply-chain profile", () => {
  const runtime = loadLegacyRuntime();
  const report = runtime.buildReport(
    "Build an S-LCA for a sugar factory producing 1,000 tonnes annually in the United Kingdom",
  );
  const supplyChainText = JSON.stringify(report.supplyChain).toLowerCase();

  assert.equal(report.product, "sugar");
  assert.equal(report.country, "United Kingdom");
  assert.doesNotMatch(supplyChainText, /coffee|ethiopia|colombia/);
});

test("country context does not leak a different state into the report", () => {
  const runtime = loadLegacyRuntime();
  const report = runtime.buildReport(
    "Build an S-LCA for a car factory producing 4,000 vehicles annually in New York, United States",
  );

  assert.doesNotMatch(runtime.reportHTML(report), /Texas runs no state OSHA plan/i);
});
