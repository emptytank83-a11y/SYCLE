"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { applyQuestionDefaults, generateQuestions } = require("../questions");

function scenarioScore(spec) {
  return {
    workers: spec.site_status === "operating" ? 70 : 68,
    supply_chain: spec.variant === "ev" ? 40 : 55,
    community: spec.make_or_buy === "vertically_integrated" ? 47 : 49,
  };
}

test("asks ambiguous geography and only score-material unknowns", () => {
  const spec = {
    product: "passenger car",
    geo_resolution: { ambiguity: true, candidates: [
      { geography: { id: "US-NY" } }, { geography: { id: "US-PLACE-51000" } },
    ] },
  };
  const questions = generateQuestions(spec, { scoreScenario: scenarioScore, threshold: 5 });
  assert.deepEqual(questions.map((question) => question.id), ["geography", "variant"]);
  assert.equal(questions[1].score_impact_range, 15);
});

test("unanswered defaults are explicitly labelled assumptions", () => {
  const questions = generateQuestions({ product: "passenger car" }, { scoreScenario: scenarioScore, threshold: 5 });
  const result = applyQuestionDefaults({ product: "passenger car" }, questions);
  assert.equal(result.variant, "ice");
  assert.deepEqual(result.assumptions[0], {
    type: "ASSUMPTION", field: "variant", value: "ice",
    reason: "Clarifying question unanswered; documented default applied",
  });
});
