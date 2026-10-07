#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { MemoryEvidenceRepository } = require("../storage");
const { listUnverifiedRules } = require("../rules");
const { DEFINITIONS, createConnector } = require("../ingestion/official-connectors");

async function main(argv = process.argv.slice(2), io = process) {
  const [command, file] = argv;
  if (command === "rules:unverified") {
    if (!file) throw new Error("rules:unverified requires a repository seed JSON file");
    const seed = JSON.parse(fs.readFileSync(file, "utf8"));
    const repo = new MemoryEvidenceRepository(seed);
    const pending = listUnverifiedRules(repo);
    io.stdout.write(`${JSON.stringify({ count: pending.length, rules: pending }, null, 2)}\n`);
    return 0;
  }
  if (command === "connectors:list") {
    io.stdout.write(`${JSON.stringify(DEFINITIONS, null, 2)}\n`);
    return 0;
  }
  if (command === "connectors:run") {
    const id = file;
    const input = argv[2];
    const edition = argv[3] || "unspecified";
    if (!id || !input) throw new Error("connectors:run requires <id> <canonical-file> [edition]");
    const ids = id === "all" ? Object.keys(DEFINITIONS).filter((key) => DEFINITIONS[key].mode === "file") : [id];
    const results = [];
    for (const connectorId of ids) {
      const connector = createConnector(connectorId, { file: input, edition });
      results.push(await connector.run(new MemoryEvidenceRepository(), { dryRun: true }));
    }
    io.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return 0;
  }
  io.stderr.write("Usage: evidence-engine <rules:unverified|connectors:list|connectors:run> ...\n");
  return 2;
}

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

module.exports = { main };
