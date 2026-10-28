"use strict";

const crypto = require("node:crypto");

function checksum(payload) {
  const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(typeof payload === "string" ? payload : JSON.stringify(payload));
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

class Connector {
  constructor({ id, source, edition, fetchImpl = globalThis.fetch, retries = 2 }) {
    this.id = id;
    this.source = source;
    this.edition = edition;
    this.fetchImpl = fetchImpl;
    this.retries = retries;
  }

  async fetch() { throw new Error("Connector.fetch must be implemented"); }
  parse() { throw new Error("Connector.parse must be implemented"); }
  validate(rows) {
    if (!Array.isArray(rows)) throw new Error(`${this.id} parser must return an array`);
    return rows;
  }

  async fetchWithRetry() {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try { return await this.fetch(); } catch (error) { lastError = error; }
    }
    throw lastError;
  }

  async run(repo, { dryRun = false, ingestedAt = new Date().toISOString() } = {}) {
    const raw = await this.fetchWithRetry();
    const rows = this.validate(await this.parse(raw));
    const sourceVersion = {
      id: `${this.id}:${this.edition}:${checksum(raw).slice(0, 16)}`,
      source_id: this.source.id,
      edition: this.edition,
      ingested_at: ingestedAt,
      checksum: checksum(raw),
    };
    const evidence = rows.map((row, index) => ({ ...row, id: row.id || `${sourceVersion.id}:${index}`, source_version_id: sourceVersion.id }));
    if (!dryRun) {
      if (!repo.get("source", this.source.id)) repo.insert("source", this.source);
      repo.insert("source_version", sourceVersion);
      for (const row of evidence) repo.insert("evidence", row);
    }
    return { connector: this.id, dryRun, sourceVersion, evidence };
  }
}

class CanonicalFileConnector extends Connector {
  constructor(options) { super(options); this.file = options.file; }
  async fetch() { return require("node:fs").promises.readFile(this.file); }
  parse(raw) { return JSON.parse(raw.toString("utf8")).evidence || []; }
}

class JsonApiConnector extends Connector {
  constructor(options) { super(options); this.url = options.url; this.mapRows = options.mapRows; }
  async fetch() {
    const response = await this.fetchImpl(this.url);
    if (!response.ok) throw new Error(`${this.id} HTTP ${response.status}`);
    return response.text();
  }
  parse(raw) { return this.mapRows(JSON.parse(String(raw))); }
}

module.exports = { CanonicalFileConnector, Connector, JsonApiConnector, checksum };
