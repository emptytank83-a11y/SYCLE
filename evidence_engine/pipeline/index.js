"use strict";

const { resolveGeography } = require("../geography");
const { generateQuestions, applyQuestionDefaults } = require("../questions");
const { assembleEvidenceBundle } = require("../assembler");
const { scoreEvidenceBundle, loadScoringConfig } = require("../scoring");
const { narrate } = require("../narrator");
const { validateReport } = require("../validator");
const { loadCatalogue } = require("../catalogue");

async function runEvidencePipeline(spec, options) {
  const { repo, answers = {}, threshold = 5, llmClient = null, activityWeights = null } = options;
  const catalogue = options.catalogue || loadCatalogue();
  const scoringConfig = options.scoringConfig || loadScoringConfig();
  let working = structuredClone(spec);
  if (!working.geo_chain) {
    const geo_resolution = resolveGeography(working.location, repo);
    working.geo_resolution = geo_resolution;
    if (geo_resolution.ambiguity) {
      return { status: "needs_clarification", questions: generateQuestions(working, { threshold }) };
    }
    if (geo_resolution.gap) return { status: "blocked", gap: geo_resolution.gap, questions: [] };
    working.geo_chain = geo_resolution.chain;
  }

  const scoreScenario = (candidate) => {
    const bundle = assembleEvidenceBundle(candidate, catalogue, repo);
    return scoreEvidenceBundle(bundle, scoringConfig, { activityWeights }).pillars;
  };
  const questions = generateQuestions(working, { scoreScenario, threshold });
  working = applyQuestionDefaults(working, questions, answers);
  const bundle = assembleEvidenceBundle(working, catalogue, repo);
  const scores = scoreEvidenceBundle(bundle, scoringConfig, { activityWeights });
  const narrative = await narrate(bundle, scores, { llmClient });
  const evidence_v2 = {
    version: 2,
    generated_at: options.generatedAt || new Date().toISOString(),
    spec: working,
    questions,
    bundle,
    scores,
    narrative,
    data_versions: bundle.data_versions.map((version) => ({ id: version.id, checksum: version.checksum, edition: version.edition })),
  };
  evidence_v2.validation = validateReport({ evidence_v2 });
  return { status: "complete", evidence_v2 };
}

module.exports = { runEvidencePipeline };
