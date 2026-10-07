"use strict";

function parseBoolean(value) {
  return /^(1|true|yes|on)$/i.test(String(value || ""));
}

function loadConfig(env = process.env) {
  return Object.freeze({
    enabled: parseBoolean(env.EVIDENCE_ENGINE_ENABLED),
    criticalQuestionThreshold: Number(env.EVIDENCE_ENGINE_QUESTION_THRESHOLD || 5),
  });
}

module.exports = { loadConfig, parseBoolean };
