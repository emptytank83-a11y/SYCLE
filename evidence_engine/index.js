"use strict";

const { loadConfig } = require("./config");
const { runEvidencePipeline } = require("./pipeline");
const { adaptEvidenceV2ToLegacy } = require("./adapter");

function attachEvidenceV2(report, evidenceV2, env = process.env) {
  if (!loadConfig(env).enabled) return report;
  return { ...report, evidence_v2: evidenceV2 };
}

module.exports = { adaptEvidenceV2ToLegacy, attachEvidenceV2, loadConfig, runEvidencePipeline };
