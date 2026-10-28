"use strict";

const PILLAR_MAP = Object.freeze({
  workers: "worker",
  local_communities: "community",
  society: "governance",
  consumers: "consumer",
  value_chain_actors: "supplyChain",
  children: "humanRights",
});

function adaptEvidenceV2ToLegacy(report, { enabled = false } = {}) {
  if (!enabled || !report?.evidence_v2) return report;
  const next = structuredClone(report);
  const v2 = next.evidence_v2;
  next.scores = { ...(next.scores || {}) };
  for (const [pillar, score] of Object.entries(v2.scores?.pillars || {})) {
    if (PILLAR_MAP[pillar]) next.scores[PILLAR_MAP[pillar]] = Math.round(score);
  }
  if (Number.isFinite(v2.scores?.overall)) next.scores.overall = Math.round(v2.scores.overall);
  next.model = { ...(next.model || {}) };
  next.model.references = (v2.bundle?.references || []).map((source) => ({ name: source.name, url: source.url, evidence_v2_source_id: source.id }));
  next.model.evidenceNarrative = v2.narrative;
  next.model.provenanceTags = { facts: "FACT", assumptions: "ASSUMPTION", benchmarks: "BENCHMARK" };
  return next;
}

module.exports = { PILLAR_MAP, adaptEvidenceV2ToLegacy };
