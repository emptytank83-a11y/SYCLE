"use strict";

const LEVELS = new Set(["country", "state", "county", "site"]);
const CONFIDENCE = new Set(["H", "M", "L"]);

const REQUIRED = {
  source: ["id", "name", "publisher", "url", "licence", "licence_commercial_ok", "update_cadence"],
  source_version: ["id", "source_id", "edition", "ingested_at", "checksum"],
  geography: ["id", "name", "level", "parent_id"],
  indicator: ["id", "name", "unit", "direction", "unep_stakeholder", "unep_subcategory"],
  evidence: ["id", "indicator_id", "geography_id", "sector_code", "value", "value_text", "source_version_id", "geo_level_used", "is_fallback", "confidence", "notes"],
  jurisdiction_rule: ["id", "geography_id", "rule_key", "rule_value", "effective_from", "source_url", "verified", "verified_by", "verified_at"],
};

function validateRecord(kind, record) {
  if (!REQUIRED[kind]) throw new Error(`Unknown record kind: ${kind}`);
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError(`${kind} must be an object`);
  }
  for (const key of REQUIRED[kind]) {
    if (!Object.hasOwn(record, key)) throw new Error(`${kind}.${key} is required`);
  }
  if (kind === "geography" && !LEVELS.has(record.level)) throw new Error("Invalid geography level");
  if (kind === "evidence") {
    if (!LEVELS.has(record.geo_level_used)) throw new Error("Invalid evidence geo_level_used");
    if (!CONFIDENCE.has(record.confidence)) throw new Error("Invalid evidence confidence");
    if (record.value == null && record.value_text == null) throw new Error("Evidence requires value or value_text");
  }
  if (kind === "source" && record.licence_commercial_ok !== null && typeof record.licence_commercial_ok !== "boolean") {
    throw new Error("source.licence_commercial_ok must be boolean or null");
  }
  return Object.freeze(structuredClone(record));
}

module.exports = { CONFIDENCE, LEVELS, REQUIRED, validateRecord };
