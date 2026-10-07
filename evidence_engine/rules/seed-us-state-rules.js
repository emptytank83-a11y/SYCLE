#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const { RULE_KEYS } = require(".");

const SOURCE_URLS = Object.freeze({
  right_to_work: "https://www.nlrb.gov/about-nlrb/rights-we-protect/the-law/right-to-work-laws-and-bargaining-security-agreements",
  state_osha_plan: "https://www.osha.gov/stateplans",
  workers_comp_mandatory: "https://www.dol.gov/agencies/owcp/wc",
  workers_comp_opt_out_allowed: "https://www.dol.gov/agencies/owcp/wc",
  state_minimum_wage: "https://www.dol.gov/agencies/whd/minimum-wage/state",
  pay_transparency_law: "https://www.dol.gov/agencies/wb",
  paid_sick_leave: "https://www.dol.gov/agencies/whd/state",
});

function seedUSStateRules(geographies) {
  const states = geographies.filter((geo) => geo.level === "state" && geo.parent_id === "US");
  if (states.length !== 51) throw new Error(`Expected 50 states plus DC; received ${states.length}`);
  return states.flatMap((state) => RULE_KEYS.map((ruleKey) => ({
    id: `${state.id}:${ruleKey}:draft-1`,
    geography_id: state.id,
    rule_key: ruleKey,
    rule_value: null,
    effective_from: null,
    source_url: SOURCE_URLS[ruleKey],
    verified: false,
    verified_by: null,
    verified_at: null,
  })));
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("Usage: seed-us-state-rules <ingested-geographies.json>\n");
    process.exitCode = 2;
  } else {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    process.stdout.write(`${JSON.stringify(seedUSStateRules(parsed.records || parsed), null, 2)}\n`);
  }
}

module.exports = { SOURCE_URLS, seedUSStateRules };
