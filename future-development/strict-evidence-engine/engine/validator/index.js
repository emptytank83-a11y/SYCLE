"use strict";

const PLACEHOLDERS = /^(source|government labour agencies|industry publications|reference)$/i;

function recomputeLegacyOverall(scores) {
  const weights = { worker: .18, humanRights: .22, community: .13, supplyChain: .22, governance: .12, consumer: .13 };
  if (!scores || Object.keys(weights).some((key) => !Number.isFinite(scores[key]))) return null;
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + scores[key] * weight, 0);
}

function collectText(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectText(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectText(item, output));
  return output;
}

function setDifference(left, right) { return [...left].filter((item) => !right.has(item)); }

function validateReport(report, { knownGeographies = [] } = {}) {
  const findings = [];
  const v2 = report.evidence_v2 || null;
  const text = collectText(v2?.narrative || report.model || report).join(" ");
  const allowedGeo = new Set([
    report.country, report.region,
    ...(v2?.bundle?.geography?.names || []),
    ...(v2?.bundle?.sourcing || []).map((item) => item.country),
  ].filter(Boolean));
  const known = new Set([...knownGeographies, ...(v2?.bundle?.geography?.known_names || [])]);
  for (const geography of known) {
    if (text.includes(geography) && !allowedGeo.has(geography)) findings.push({ code: "foreign_geography", geography });
  }

  const countrySets = [report.sourcing, report.countryRiskCountries, report.highRiskCountries]
    .filter(Array.isArray).map((items) => new Set(items.map((item) => typeof item === "string" ? item : item.country).filter(Boolean)));
  if (countrySets.length > 1) {
    const union = new Set(countrySets.flatMap((set) => [...set]));
    for (const set of countrySets) {
      const missing = setDifference(union, set);
      if (missing.length) findings.push({ code: "country_set_mismatch", missing });
    }
  }

  const references = v2?.bundle?.references || report.model?.references || report.references || [];
  for (const reference of references) {
    if (!reference?.url || PLACEHOLDERS.test(reference.name || "")) findings.push({ code: "placeholder_reference", reference: reference?.name || null });
  }

  if (v2?.scores) {
    const trace = v2.scores.trace?.pillars || [];
    const numerator = trace.reduce((sum, pillar) => sum + pillar.score * pillar.weight, 0);
    const denominator = trace.reduce((sum, pillar) => sum + pillar.weight, 0);
    const recomputed = denominator ? numerator / denominator : null;
    if (Number.isFinite(recomputed) && Math.abs(recomputed - v2.scores.overall) > 1e-6) findings.push({ code: "score_mismatch", published: v2.scores.overall, recomputed });
  } else {
    const recomputed = recomputeLegacyOverall(report.scores);
    if (Number.isFinite(recomputed) && Math.abs(Math.round(recomputed) - report.scores.overall) > 0) findings.push({ code: "score_mismatch", published: report.scores.overall, recomputed });
  }

  const ratings = new Map();
  function inspect(value) {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (!value || typeof value !== "object") return;
    const issue = value.issue || value.risk || value.title;
    const band = value.band ?? value.riskLevel ?? value.rating;
    if (issue && Number.isFinite(band)) {
      const prior = ratings.get(issue) || [];
      prior.push(band); ratings.set(issue, prior);
    }
    Object.values(value).forEach(inspect);
  }
  inspect(report);
  for (const [issue, bands] of ratings) if (Math.max(...bands) - Math.min(...bands) > 1) findings.push({ code: "rating_contradiction", issue, bands });

  if (v2) {
    const validIds = new Set([...(v2.bundle?.indicators || []).map((item) => item.evidence_id), ...(v2.bundle?.sourcing || []).map((item) => item.evidence_id), "score:overall", ...Object.keys(v2.scores?.pillars || {}).map((key) => `score:${key}`)]);
    for (const section of v2.narrative?.sections || []) for (const sentence of section.sentences || []) {
      if (!sentence.support_ids?.length || sentence.support_ids.some((id) => !validIds.has(id))) findings.push({ code: "unbacked_sentence", text: sentence.text });
    }
  }
  return { valid: findings.length === 0, findings };
}

function validateReports(reports, options) {
  const results = reports.map((report) => ({ id: report.id || null, ...validateReport(report, options) }));
  return { total: results.length, passed: results.filter((item) => item.valid).length, findings: results.reduce((sum, item) => sum + item.findings.length, 0), results };
}

module.exports = { collectText, recomputeLegacyOverall, validateReport, validateReports };
