"use strict";

const { runEvidencePipeline } = require("../pipeline");
const { validateReport } = require("../validator");

function evidenceBackedPercent(v2) {
  const sentences = (v2?.narrative?.sections || []).flatMap((section) => section.sentences || []);
  if (!sentences.length) return 0;
  return 100 * sentences.filter((sentence) => sentence.support_ids?.length).length / sentences.length;
}

function stateEvidencePercent(v2) {
  const stats = v2?.bundle?.statistics;
  return stats?.indicators_found ? 100 * stats.indicators_state_or_better / stats.indicators_found : 0;
}

function compareResults(prompt, legacyReport, nextResult, knownGeographies = []) {
  const legacyValidation = validateReport(legacyReport, { knownGeographies });
  const v2 = nextResult.evidence_v2 || null;
  return {
    prompt,
    status: nextResult.status,
    scores: { legacy: legacyReport.scores || null, evidence_v2: v2?.scores || null },
    countries: {
      legacy: legacyReport.sourcing || [],
      evidence_v2: v2?.bundle?.sourcing?.map((item) => item.country) || [],
    },
    hotspots: { legacy: legacyReport.model?.supplyChain || legacyReport.supplyChain || null, evidence_v2: v2?.bundle?.indicators || [] },
    validator_findings: { legacy: legacyValidation.findings, evidence_v2: v2?.validation?.findings || [] },
    evidence_backed_sentences_percent: evidenceBackedPercent(v2),
    state_or_better_indicators_percent: stateEvidencePercent(v2),
    questions: nextResult.questions || [],
  };
}

async function comparePipelines(prompt, { legacyRuntime, repo, catalogue, scoringConfig, generatedAt }) {
  const legacyReport = legacyRuntime.buildReport(prompt, { id: "compare", style: { name: "compare", voice: "compare", open: "Compare", link: "Compare" } });
  const spec = {
    product: legacyReport.product,
    sector_code: legacyReport.sectorKey,
    scale: legacyReport.qty,
    location: legacyReport.region || legacyReport.country,
    hs_codes: [], key_minerals: [],
  };
  const nextResult = await runEvidencePipeline(spec, { repo, catalogue, scoringConfig, generatedAt });
  return compareResults(prompt, legacyReport, nextResult, repo.list("geography").map((geo) => geo.name));
}

module.exports = { comparePipelines, compareResults, evidenceBackedPercent, stateEvidencePercent };
