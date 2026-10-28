"use strict";

function compareGolden(actual, expected, { scoreTolerance = 0 } = {}) {
  const findings = [];
  for (const [pillar, expectedScore] of Object.entries(expected.scores || {})) {
    const actualScore = actual.scores?.[pillar];
    if (!Number.isFinite(actualScore) || Math.abs(actualScore - expectedScore) > scoreTolerance) findings.push({ code: "score_drift", pillar, expected: expectedScore, actual: actualScore });
  }
  if ((actual.validator_pass_rate ?? 0) < (expected.validator_pass_rate ?? 0)) findings.push({ code: "validator_regression", expected: expected.validator_pass_rate, actual: actual.validator_pass_rate });
  return { pass: findings.length === 0, findings };
}

module.exports = { compareGolden };
