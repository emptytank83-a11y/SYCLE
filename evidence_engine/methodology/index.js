"use strict";

function exportMethodology(catalogue, scoringConfig, sourceVersions = []) {
  const lines = [
    "# SYCLE evidence methodology", "",
    `Catalogue version: ${catalogue.version}`, `Expert review: ${catalogue.expert_review}`, "",
    "## Geography fallback", "",
    `Order: ${(catalogue.fallback?.order || []).join(" -> ")}`,
    `Confidence downgrade per step: ${catalogue.fallback?.confidence_downgrade_per_step ?? "not configured"}`, "",
    "## Pillar weights", "",
    ...Object.entries(scoringConfig.pillar_weights || {}).map(([key, value]) => `- ${key}: ${value}`), "",
    "## Indicators", "",
    ...Object.entries(scoringConfig.indicators || {}).map(([key, value]) => `- ${key}: pillar=${value.pillar}; subcategory=${value.subcategory}; weight=${value.weight}; normalisation=${JSON.stringify(value.normalisation)}`), "",
    "## Source versions", "",
    ...(sourceVersions.length ? sourceVersions.map((version) => `- ${version.id}: edition=${version.edition}; checksum=${version.checksum}`) : ["- No source versions supplied"]), "",
  ];
  return lines.join("\n");
}

module.exports = { exportMethodology };
