"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadCatalogue } = require("../catalogue");
const { MemoryEvidenceRepository } = require("../storage");
const { createConnector, DEFINITIONS } = require("../ingestion/official-connectors");

test("catalogue covers every UNEP stakeholder category", () => {
  const catalogue = loadCatalogue();
  assert.deepEqual(new Set(catalogue.stakeholders.map((item) => item.id)),
    new Set(["workers", "local_communities", "society", "consumers", "value_chain_actors", "children"]));
  assert.equal(catalogue.expert_review, "pending");
});

test("all requested official connectors are registered with unresolved licences", () => {
  assert.equal(Object.keys(DEFINITIONS).length, 14);
  for (const id of Object.keys(DEFINITIONS)) {
    const { sourceRecord } = require("../ingestion/official-connectors");
    assert.equal(sourceRecord(id).licence_commercial_ok, null);
  }
});

test("file connector dry-run checksums and parses recorded fixture without writes", async () => {
  const repo = new MemoryEvidenceRepository();
  const connector = createConnector("bls_soii", {
    file: path.join(__dirname, "fixtures", "connector-evidence.json"), edition: "recorded-test",
  });
  const result = await connector.run(repo, { dryRun: true, ingestedAt: "2026-01-01T00:00:00Z" });
  assert.equal(result.evidence.length, 1);
  assert.match(result.sourceVersion.checksum, /^[a-f0-9]{64}$/);
  assert.equal(repo.list("evidence").length, 0);
});
