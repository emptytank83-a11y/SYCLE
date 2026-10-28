"use strict";

function normalise(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildChain(repo, geography, { includeSite = true } = {}) {
  const chain = [];
  let current = geography;
  while (current) {
    if (includeSite || current.level !== "site") chain.push(current);
    current = current.parent_id ? repo.get("geography", current.parent_id) : null;
  }
  return chain;
}

function candidateTerms(geo) {
  return [geo.id, geo.name, ...(geo.aliases || [])].map(normalise).filter(Boolean);
}

function resolveGeography(input, repo) {
  const query = normalise(input);
  if (!query) return { input, ambiguity: false, candidates: [], gap: "empty_geography" };
  const records = repo.list("geography");
  const exact = records.filter((geo) => candidateTerms(geo).includes(query));
  if (exact.length > 1) {
    return {
      input,
      ambiguity: true,
      candidates: exact.map((geo) => ({ geography: geo, chain: buildChain(repo, geo) })),
    };
  }
  if (exact.length === 1) {
    const geo = exact[0];
    const chain = buildChain(repo, geo, { includeSite: false });
    return { input, ambiguity: false, geography: geo.level === "site" ? chain[0] : geo, chain };
  }

  const tokens = new Set(query.split(" "));
  const ranked = records.map((geo) => {
    const hits = candidateTerms(geo).filter((term) => query.includes(term) || term.split(" ").every((part) => tokens.has(part)));
    return { geo, score: hits.length ? Math.max(...hits.map((term) => term.length)) : 0 };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);

  if (!ranked.length) return { input, ambiguity: false, candidates: [], gap: "geography_not_found" };
  const bestScore = ranked[0].score;
  const best = ranked.filter((item) => item.score === bestScore).map((item) => item.geo);
  if (best.length > 1) {
    return { input, ambiguity: true, candidates: best.map((geo) => ({ geography: geo, chain: buildChain(repo, geo) })) };
  }
  const geo = best[0];
  const chain = buildChain(repo, geo, { includeSite: false });
  return { input, ambiguity: false, geography: geo.level === "site" ? chain[0] : geo, chain };
}

module.exports = { buildChain, normalise, resolveGeography };
