"use strict";

const { RULE_KEYS, getRule } = require("../rules");

const CONFIDENCE = ["L", "M", "H"];
const SOURCING_SOURCES = new Set(["un_comtrade", "usitc_dataweb", "usgs_mcs"]);

function downgrade(confidence, steps) {
  const index = Math.max(0, CONFIDENCE.indexOf(confidence));
  return CONFIDENCE[Math.max(0, index - Math.max(0, steps))];
}

function catalogueIndicators(catalogue) {
  return catalogue.stakeholders.flatMap((stakeholder) => stakeholder.subcategories.flatMap((subcategory) =>
    subcategory.indicators.map((indicator) => ({ ...indicator, stakeholder: stakeholder.id, subcategory: subcategory.id }))));
}

function sourceIdForEvidence(repo, evidence) {
  const version = repo.get("source_version", evidence.source_version_id);
  return version?.source_id || null;
}

function selectEvidence(indicator, spec, repo, fallbackConfig) {
  const geoIds = spec.geo_chain.map((geo) => geo.id);
  const candidates = repo.findEvidence({ indicator_id: indicator.id, geography_ids: geoIds, sector_code: spec.sector_code });
  const sourceRanks = new Map(indicator.candidate_sources.map((source) => [source.source_id, source.rank]));
  const eligible = candidates.filter((evidence) => sourceRanks.has(sourceIdForEvidence(repo, evidence)));
  eligible.sort((a, b) => {
    const geo = geoIds.indexOf(a.geography_id) - geoIds.indexOf(b.geography_id);
    if (geo) return geo;
    return sourceRanks.get(sourceIdForEvidence(repo, a)) - sourceRanks.get(sourceIdForEvidence(repo, b));
  });
  const selected = eligible[0];
  if (!selected) return null;
  const fallbackSteps = Math.max(0, geoIds.indexOf(selected.geography_id));
  return {
    indicator_id: indicator.id,
    stakeholder: indicator.stakeholder,
    subcategory: indicator.subcategory,
    evidence_id: selected.id,
    value: selected.value,
    value_text: selected.value_text,
    source_version_id: selected.source_version_id,
    geography_id: selected.geography_id,
    geo_level_used: selected.geo_level_used,
    is_fallback: fallbackSteps > 0,
    fallback_steps: fallbackSteps,
    confidence: downgrade(selected.confidence, fallbackSteps * (fallbackConfig.confidence_downgrade_per_step || 1)),
  };
}

function deriveSourcing(spec, repo) {
  const hs = new Set(spec.hs_codes || []);
  const minerals = new Set(spec.key_minerals || []);
  const rows = repo.list("evidence", (evidence) => {
    const sourceId = sourceIdForEvidence(repo, evidence);
    if (!SOURCING_SOURCES.has(sourceId)) return false;
    const dimensions = evidence.dimensions || {};
    return (dimensions.hs_code && hs.has(dimensions.hs_code)) || (dimensions.mineral && minerals.has(dimensions.mineral));
  });
  return rows.map((evidence) => ({
    country: evidence.dimensions.country,
    share: evidence.value,
    share_type: evidence.dimensions.hs_code ? "import_share" : "production_share",
    hs_code: evidence.dimensions.hs_code || null,
    mineral: evidence.dimensions.mineral || null,
    evidence_id: evidence.id,
    source_version_id: evidence.source_version_id,
    confidence: evidence.confidence,
  })).filter((item) => item.country && Number.isFinite(item.share));
}

function assembleEvidenceBundle(spec, catalogue, repo) {
  if (!Array.isArray(spec.geo_chain) || !spec.geo_chain.length) throw new Error("Resolved geo_chain is required");
  const indicators = [], gaps = [];
  for (const indicator of catalogueIndicators(catalogue)) {
    const selected = selectEvidence(indicator, spec, repo, catalogue.fallback || {});
    if (selected) indicators.push(selected);
    else gaps.push({ indicator_id: indicator.id, status: "gap", needs_verification: true });
  }
  const jurisdiction_rules = RULE_KEYS.map((key) => getRule(repo, spec.geo_chain, key));
  const sourcing = deriveSourcing(spec, repo);
  const versionIds = new Set([...indicators.map((item) => item.source_version_id), ...sourcing.map((item) => item.source_version_id)]);
  const sourceVersions = [...versionIds].map((id) => repo.get("source_version", id)).filter(Boolean);
  const sourceIds = new Set(sourceVersions.map((version) => version.source_id));
  return {
    spec: structuredClone(spec),
    geography: { chain: spec.geo_chain.map((geo) => geo.id), resolved_level: spec.geo_chain[0].level },
    indicators,
    gaps,
    sourcing,
    jurisdiction_rules,
    statistics: {
      indicators_requested: indicators.length + gaps.length,
      indicators_found: indicators.length,
      indicators_state_or_better: indicators.filter((item) => ["site", "county", "state"].includes(item.geo_level_used)).length,
    },
    references: [...sourceIds].map((id) => repo.get("source", id)).filter(Boolean),
    data_versions: sourceVersions,
  };
}

module.exports = { assembleEvidenceBundle, catalogueIndicators, deriveSourcing, downgrade, selectEvidence };
