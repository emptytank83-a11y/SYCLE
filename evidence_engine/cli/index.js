#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { MemoryEvidenceRepository } = require("../storage");
const { listUnverifiedRules } = require("../rules");

function main(argv = process.argv.slice(2), io = process) {
  const [command, file] = argv;
  if (command === "rules:unverified") {
    if (!file) throw new Error("rules:unverified requires a repository seed JSON file");
    const seed = JSON.parse(fs.readFileSync(file, "utf8"));
    const repo = new MemoryEvidenceRepository(seed);
    const pending = listUnverifiedRules(repo);
    io.stdout.write(`${JSON.stringify({ count: pending.length, rules: pending }, null, 2)}\n`);
    return 0;
  }
  io.stderr.write("Usage: evidence-engine rules:unverified <repository-seed.json>\n");
  return 2;
}

if (require.main === module) process.exitCode = main();

module.exports = { main };
