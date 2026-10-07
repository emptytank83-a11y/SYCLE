"use strict";

const { loadConfig } = require("./config");

function attachEvidenceV2(report, evidenceV2, env = process.env) {
  if (!loadConfig(env).enabled) return report;
  return { ...report, evidence_v2: evidenceV2 };
}

module.exports = { attachEvidenceV2, loadConfig };
