"use strict";

const fs = require("node:fs");
const path = require("node:path");

function validateCatalogue(catalogue) {
  if (!catalogue || catalogue.version !== 1 || !Array.isArray(catalogue.stakeholders)) {
    throw new Error("Catalogue must have version 1 and stakeholders[]");
  }
  const required = new Set(["workers", "local_communities", "society", "consumers", "value_chain_actors", "children"]);
  for (const stakeholder of catalogue.stakeholders) {
    required.delete(stakeholder.id);
    if (!stakeholder.id || !Array.isArray(stakeholder.subcategories) || !stakeholder.subcategories.length) throw new Error("Invalid stakeholder");
    for (const subcategory of stakeholder.subcategories) {
      if (!subcategory.id || !Array.isArray(subcategory.indicators) || !subcategory.indicators.length) throw new Error("Invalid subcategory");
      for (const indicator of subcategory.indicators) {
        if (!indicator.id || !indicator.unit || !indicator.direction || !Array.isArray(indicator.candidate_sources)) throw new Error("Invalid indicator");
        for (const candidate of indicator.candidate_sources) {
          if (!candidate.source_id || !candidate.geo_level || typeof candidate.rank !== "number") throw new Error("Invalid candidate source");
        }
      }
    }
  }
  if (required.size) throw new Error(`Missing UNEP stakeholder categories: ${[...required].join(", ")}`);
  return Object.freeze(structuredClone(catalogue));
}

function loadCatalogue(file = path.join(__dirname, "catalogue.yaml")) {
  return validateCatalogue(JSON.parse(fs.readFileSync(file, "utf8")));
}

module.exports = { loadCatalogue, validateCatalogue };
