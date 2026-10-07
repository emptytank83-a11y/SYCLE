"use strict";

const QUESTION_DEFINITIONS = Object.freeze({
  variant: {
    text: "Which product variant should this assessment cover?",
    options: ["ice", "ev"],
    default_if_unanswered: "ice",
  },
  make_or_buy: {
    text: "Which major components are made at the site versus purchased?",
    options: ["assembly_only", "mixed", "vertically_integrated"],
    default_if_unanswered: "mixed",
  },
  site_status: {
    text: "Is the site proposed, under construction, or operating?",
    options: ["proposed", "under_construction", "operating"],
    default_if_unanswered: "proposed",
  },
});

function pillarImpact(scoreSets) {
  const pillars = new Set(scoreSets.flatMap((scores) => Object.keys(scores || {})));
  let widest = 0;
  for (const pillar of pillars) {
    const values = scoreSets.map((scores) => scores?.[pillar]).filter(Number.isFinite);
    if (values.length) widest = Math.max(widest, Math.max(...values) - Math.min(...values));
  }
  return widest;
}

function generateQuestions(spec, { scoreScenario, threshold = 5 } = {}) {
  const questions = [];
  if (spec.geo_resolution?.ambiguity) {
    const options = spec.geo_resolution.candidates.map((candidate) => candidate.geography.id);
    questions.push({
      id: "geography",
      text: "Which location did you mean?",
      options,
      default_if_unanswered: null,
      score_impact_range: null,
      required: true,
    });
  }
  for (const [field, definition] of Object.entries(QUESTION_DEFINITIONS)) {
    if (spec[field] != null) continue;
    if (typeof scoreScenario !== "function") continue;
    const scores = definition.options.map((answer) => scoreScenario({ ...spec, [field]: answer }));
    const impact = pillarImpact(scores);
    if (impact > threshold) {
      questions.push({ id: field, ...definition, score_impact_range: impact, required: false });
    }
  }
  return questions;
}

function applyQuestionDefaults(spec, questions, answers = {}) {
  const next = { ...spec };
  const assumptions = [...(spec.assumptions || [])];
  for (const question of questions) {
    const supplied = answers[question.id];
    const value = supplied ?? question.default_if_unanswered;
    if (value == null) continue;
    next[question.id] = value;
    if (supplied == null) assumptions.push({
      type: "ASSUMPTION",
      field: question.id,
      value,
      reason: "Clarifying question unanswered; documented default applied",
    });
  }
  next.assumptions = assumptions;
  return next;
}

module.exports = { QUESTION_DEFINITIONS, applyQuestionDefaults, generateQuestions, pillarImpact };
