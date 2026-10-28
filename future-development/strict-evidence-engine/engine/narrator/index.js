"use strict";

function numericTokens(text) {
  return [...String(text).matchAll(/(?<![A-Za-z])\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function supportIndex(bundle, scores) {
  const index = new Map();
  for (const item of bundle.indicators || []) {
    index.set(item.evidence_id, { numbers: [item.value].filter(Number.isFinite), fallback: item.is_fallback });
  }
  for (const item of bundle.sourcing || []) {
    index.set(item.evidence_id, { numbers: [item.share].filter(Number.isFinite), fallback: false });
  }
  for (const [pillar, value] of Object.entries(scores.pillars || {})) index.set(`score:${pillar}`, { numbers: [value], fallback: false });
  if (Number.isFinite(scores.overall)) index.set("score:overall", { numbers: [scores.overall], fallback: false });
  return index;
}

function constrainNarrative(candidate, bundle, scores) {
  const supports = supportIndex(bundle, scores);
  const allowedGeo = new Set([...(bundle.geography?.names || []), ...(bundle.sourcing || []).map((item) => item.country)]);
  const knownGeo = new Set(bundle.geography?.known_names || []);
  const sections = [], findings = [];
  for (const section of candidate.sections || []) {
    const sentences = [];
    for (const sentence of section.sentences || []) {
      const ids = Array.isArray(sentence.support_ids) ? sentence.support_ids : [];
      if (!ids.length || ids.some((id) => !supports.has(id))) {
        findings.push({ code: "unsupported_reference", text: sentence.text });
        continue;
      }
      const allowedNumbers = new Set(ids.flatMap((id) => supports.get(id).numbers));
      if (numericTokens(sentence.text).some((number) => !allowedNumbers.has(number))) {
        findings.push({ code: "invented_number", text: sentence.text });
        continue;
      }
      const wrongGeography = [...knownGeo].find((name) => sentence.text.includes(name) && !allowedGeo.has(name));
      if (wrongGeography) {
        findings.push({ code: "wrong_geography", geography: wrongGeography, text: sentence.text });
        continue;
      }
      if (ids.some((id) => supports.get(id).fallback) && !/used; no .+ data available/i.test(sentence.text)) {
        findings.push({ code: "implicit_fallback", text: sentence.text });
        continue;
      }
      sentences.push({ text: sentence.text, support_ids: ids });
    }
    sections.push({ id: section.id, title: section.title, sentences });
  }
  return { sections, findings };
}

function deterministicCandidate(bundle, scores) {
  const sentences = [];
  for (const item of bundle.indicators || []) {
    const geo = bundle.geography?.names?.[item.fallback_steps || 0] || item.geography_id;
    const site = bundle.geography?.names?.[0] || "site";
    const fallback = item.is_fallback ? `${geo} figure used; no ${site} data available. ` : "";
    sentences.push({ text: `${fallback}${item.indicator_id} evidence is recorded as ${item.value}.`, support_ids: [item.evidence_id] });
  }
  if (Number.isFinite(scores.overall)) sentences.push({ text: `The deterministic overall score is ${scores.overall}.`, support_ids: ["score:overall"] });
  return { sections: [{ id: "evidence_summary", title: "Evidence summary", sentences }] };
}

async function narrate(bundle, scores, { llmClient = null } = {}) {
  const candidate = llmClient ? await llmClient.generate({ bundle, scores, output: "sections.sentences[text,support_ids]" }) : deterministicCandidate(bundle, scores);
  return constrainNarrative(candidate, bundle, scores);
}

module.exports = { constrainNarrative, deterministicCandidate, narrate, numericTokens, supportIndex };
