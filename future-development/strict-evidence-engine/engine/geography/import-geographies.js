#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift().map((value) => value.trim());
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])));
}

function ingest({ isoCountries, isoSubdivisions, censusCounties, censusPlaces }) {
  const countries = JSON.parse(fs.readFileSync(isoCountries, "utf8"));
  const subdivisions = JSON.parse(fs.readFileSync(isoSubdivisions, "utf8"));
  const counties = parseCsv(fs.readFileSync(censusCounties, "utf8"));
  const places = censusPlaces ? parseCsv(fs.readFileSync(censusPlaces, "utf8")) : [];
  const rows = [
    ...countries.map((row) => ({ id: row.alpha2, name: row.name, level: "country", parent_id: null, aliases: row.aliases || [] })),
    ...subdivisions.map((row) => ({ id: row.code, name: row.name, level: "state", parent_id: row.country_code, aliases: row.aliases || [] })),
    ...counties.map((row) => ({ id: `US-${row.STATEFP}-${row.COUNTYFP}`, name: row.NAME, level: "county", parent_id: row.SUBDIVISION_CODE, aliases: [] })),
    ...places.map((row) => ({ id: `US-PLACE-${row.PLACEFP}`, name: row.NAME, level: "site", parent_id: `US-${row.STATEFP}-${row.COUNTYFP}`, aliases: [] })),
  ];
  return { records: rows, checksums: [isoCountries, isoSubdivisions, censusCounties, censusPlaces].filter(Boolean)
    .map((file) => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") })) };
}

if (require.main === module) {
  const [isoCountries, isoSubdivisions, censusCounties, censusPlaces] = process.argv.slice(2);
  if (!isoCountries || !isoSubdivisions || !censusCounties) {
    process.stderr.write("Usage: import-geographies <iso-countries.json> <iso-subdivisions.json> <census-counties.csv> [census-places.csv]\n");
    process.exitCode = 2;
  } else process.stdout.write(`${JSON.stringify(ingest({ isoCountries, isoSubdivisions, censusCounties, censusPlaces }), null, 2)}\n`);
}

module.exports = { ingest, parseCsv };
