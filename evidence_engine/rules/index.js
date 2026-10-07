"use strict";

const RULE_KEYS = Object.freeze([
  "right_to_work",
  "state_osha_plan",
  "workers_comp_mandatory",
  "workers_comp_opt_out_allowed",
  "state_minimum_wage",
  "pay_transparency_law",
  "paid_sick_leave",
]);

function getRule(repo, geoChain, key) {
  if (!RULE_KEYS.includes(key)) throw new Error(`Unsupported jurisdiction rule: ${key}`);
  for (const geo of geoChain) {
    const verified = repo.list("jurisdiction_rule", (rule) =>
      rule.geography_id === geo.id && rule.rule_key === key && rule.verified === true && rule.rule_value !== null);
    if (verified.length) {
      const latest = verified.sort((a, b) => String(b.effective_from || "").localeCompare(String(a.effective_from || "")))[0];
      return { status: "verified", geography_id: geo.id, rule: latest };
    }
  }
  return {
    status: "gap",
    rule_key: key,
    geography_chain: geoChain.map((geo) => geo.id),
    needs_verification: true,
  };
}

function listUnverifiedRules(repo) {
  return repo.list("jurisdiction_rule", (rule) => rule.verified !== true);
}

module.exports = { RULE_KEYS, getRule, listUnverifiedRules };
