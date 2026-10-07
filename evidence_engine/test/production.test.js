"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generate, validate } = require("../production");

function response(payload) {
  return { ok:true, status:200, statusText:"OK", text:async () => typeof payload === "string" ? payload : JSON.stringify(payload) };
}

function fetchFixture(url) {
  if (url.includes("union2.t05")) return Promise.resolve(response(`<table><tr><th><p>New York</p></th>${[8278,1706,20.6,1814,21.9,8624,1834,21.3,1943,22.5].map((value) => `<td><span class="datavalue">${value}</span></td>`).join("")}</tr></table>`));
  if (url.includes("api.bls.gov")) return Promise.resolve(response({Results:{series:[{data:[{year:"2026",periodName:"August",latest:"true",value:"4.3"}]}]}}));
  if (url.includes("GOV_WGI_CC_EST")) return Promise.resolve(response([{lastupdated:"2026-07-13"},[{date:"2024",value:1.0868914}]]));
  if (url.includes("partnerCode=0")) return Promise.resolve(response({data:[{primaryValue:1000}]}));
  if (url.includes("comtradeapi")) return Promise.resolve(response({data:[{partnerCode:124,primaryValue:400},{partnerCode:484,primaryValue:300}]}));
  throw new Error(`Unexpected URL: ${url}`);
}

const spec = { product:"car",sectorKey:"automotive",sectorLabel:"Automotive / Vehicles",country:"United States",region:"New York",qty:4000,prompt:"Car manufacturing, 4,000 units/year, New York" };
const answers = { location_interpretation:"state",site_status:"proposed",system_boundary:"cradle_to_grave",operating_scope:"assembly_only",vehicle_variant:"ev" };

test("production generator always asks decision-critical questions before retrieval", async () => {
  const result = await generate({spec}, {fetchImpl:fetchFixture,tradeDelayMs:0});
  assert.equal(result.status,"needs_clarification");
  assert.deepEqual(result.questions.map((item) => item.id),["location_interpretation","site_status","system_boundary","operating_scope","vehicle_variant"]);
});

test("New York car report uses retrieved evidence, reconciles scores, and contains no Texas leak", async () => {
  const result = await generate({spec,answers}, {fetchImpl:fetchFixture,tradeDelayMs:0});
  assert.equal(result.status,"complete");
  const report=result.evidence_v2;
  assert.equal(report.validation.valid,true);
  assert.equal(report.validation.exportable,true);
  assert.equal(report.quality.scored_pillars,5);
  assert.match(JSON.stringify(report),/New York/);
  assert.doesNotMatch(JSON.stringify(report),/Texas/i);
  assert.deepEqual(report.sourcing.map((item)=>item.country),["Canada","Mexico"]);
  const rows=report.scores.trace.pillars;
  const recomputed=rows.reduce((sum,row)=>sum+row.score*row.weight,0)/rows.reduce((sum,row)=>sum+row.weight,0);
  assert.ok(Math.abs(recomputed-report.scores.overall)<0.11);
});

test("validator blocks unsupported supply-chain citations", async () => {
  const result = await generate({spec,answers}, {fetchImpl:fetchFixture,tradeDelayMs:0});
  const report=structuredClone(result.evidence_v2);
  report.supply_chain.stages[0].evidence.push("missing-source");
  const checked=validate(report);
  assert.equal(checked.valid,false);
  assert.equal(checked.exportable,false);
  assert.ok(checked.errors.some((item)=>item.code==="unsupported_supply_chain_claim"));
});
