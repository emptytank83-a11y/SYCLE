"use strict";

const { validateRecord } = require("../schema");

const KINDS = ["source", "source_version", "geography", "indicator", "evidence", "jurisdiction_rule"];

class EvidenceRepository {
  insert() { throw new Error("Not implemented"); }
  get() { throw new Error("Not implemented"); }
  list() { throw new Error("Not implemented"); }
  findEvidence() { throw new Error("Not implemented"); }
}

class MemoryEvidenceRepository extends EvidenceRepository {
  constructor(seed = {}) {
    super();
    this.records = new Map(KINDS.map((kind) => [kind, new Map()]));
    for (const kind of KINDS) {
      for (const record of seed[kind] || []) this.insert(kind, record);
    }
  }

  insert(kind, record) {
    const table = this.records.get(kind);
    if (!table) throw new Error(`Unknown record kind: ${kind}`);
    const checked = validateRecord(kind, record);
    if (table.has(checked.id)) throw new Error(`${kind} ${checked.id} already exists; records are immutable`);
    table.set(checked.id, checked);
    return checked;
  }

  get(kind, id) {
    return this.records.get(kind)?.get(id) || null;
  }

  list(kind, predicate = () => true) {
    const table = this.records.get(kind);
    if (!table) throw new Error(`Unknown record kind: ${kind}`);
    return [...table.values()].filter(predicate);
  }

  findEvidence({ indicator_id, geography_ids = [], sector_code = null }) {
    const geoSet = new Set(geography_ids);
    return this.list("evidence", (item) =>
      item.indicator_id === indicator_id &&
      (!geoSet.size || geoSet.has(item.geography_id)) &&
      (!sector_code || item.sector_code === sector_code || item.sector_code === null));
  }
}

module.exports = { EvidenceRepository, KINDS, MemoryEvidenceRepository };
