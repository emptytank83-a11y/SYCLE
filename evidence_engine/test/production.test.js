"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {generate,resolveProductSector,validate}=require("../production");

const carSpec={product:"year Car operation",sectorKey:"automotive",sectorLabel:"Automotive / Vehicles",country:"United States",region:"New York",qty:4000,prompt:"4 year Car operation producing 4,000 units annually in New York"};
const carAnswers={location_interpretation:"state",site_status:"proposed",system_boundary:"cradle_to_grave",operating_scope:"assembly_only",vehicle_variant:"ice"};

test("production generator asks every decision-critical question before warehouse lookup",async()=>{
  const result=await generate({spec:carSpec});
  assert.equal(result.status,"needs_clarification");
  assert.deepEqual(result.questions.map(item=>item.id),["location_interpretation","site_status","system_boundary","operating_scope","vehicle_variant"]);
});

test("New York car report uses a stored snapshot and repairs corrupted product extraction",async()=>{
  const result=await generate({spec:carSpec,answers:carAnswers},{fetchImpl:async()=>{throw new Error("report generation must not call public APIs");}});
  assert.equal(result.status,"complete");const report=result.evidence_v2;
  assert.equal(report.spec.product,"car");assert.equal(report.validation.valid,true);assert.equal(report.validation.exportable,true);
  assert.equal(report.warehouse.mode,"embedded_snapshot");assert.match(report.warehouse.snapshot_id,/^warehouse-/);assert.equal(report.scores.coverage.scored_pillars>=4,true);
  assert.match(JSON.stringify(report),/New York/);assert.doesNotMatch(JSON.stringify(report),/Texas/i);assert.equal(report.supply_chain.stages[0].inputs.includes("Iron ore"),true);
  assert.equal(report.indicators.some(item=>item.indicator_id==="union_membership_rate"&&item.geography==="New York"),true);
});

test("different industries receive different process and logistics models",async()=>{
  const diamond=await generate({spec:{product:"diamond",sectorKey:"diamond",sectorLabel:"Diamond Processing",country:"India",region:"Gujarat",qty:100,prompt:"Diamond manufacturing in Gujarat, India",answers:{site_status:"operating",system_boundary:"cradle_to_grave",operating_scope:"mixed"}}});
  const car=await generate({spec:{...carSpec,answers:carAnswers}});
  assert.equal(diamond.status,"complete");assert.equal(car.status,"complete");
  assert.notDeepEqual(diamond.evidence_v2.supply_chain.stages.map(item=>item.title),car.evidence_v2.supply_chain.stages.map(item=>item.title));
  assert.match(diamond.evidence_v2.supply_chain.stages[0].title,/diamond/i);assert.doesNotMatch(JSON.stringify(diamond.evidence_v2),/cotton/i);
});

test("generic prompts stop for industry clarification",async()=>{
  const result=await generate({spec:{product:"manufactured product",sectorKey:"generic",sectorLabel:"General Manufacturing",country:"Germany",region:"",qty:1000,prompt:"Build an S-LCA in Germany"}});
  assert.equal(result.status,"needs_clarification");assert.equal(result.questions[0].id,"industry");
});

test("explicit solar products override a stale electronics classification before questions",async()=>{
  const spec={product:"solar photovoltaic module",sectorKey:"electronics",sectorLabel:"Electronics / Consumer Hardware",country:"India",region:"Gujarat",qty:10000,prompt:"Solar panel manufacturing facility producing 10,000 modules annually in Gujarat, India"};
  assert.equal(resolveProductSector(spec),"solar_pv");
  const result=await generate({spec});
  assert.equal(result.status,"needs_clarification");
  assert.deepEqual(result.questions.map(item=>item.id),["site_status","system_boundary","operating_scope","pv_technology"]);
  assert.match(result.questions.find(item=>item.id==="operating_scope").text,/solar-PV/i);
});

test("crystalline-silicon solar reports use the PV chain and reject electronics BOM leakage",async()=>{
  const spec={product:"solar power",sectorKey:"electronics",sectorLabel:"Electronics / Consumer Hardware",country:"India",region:"Gujarat",qty:10000,prompt:"Solar panel manufacturing facility producing 10,000 modules annually in Gujarat, India"};
  const answers={site_status:"proposed",system_boundary:"cradle_to_grave",operating_scope:"module_assembly",pv_technology:"crystalline_silicon"};
  const result=await generate({spec,answers});assert.equal(result.status,"complete");const report=result.evidence_v2;
  assert.equal(report.spec.sectorKey,"solar_pv");assert.equal(report.spec.sectorLabel,"Solar Photovoltaics");assert.equal(report.spec.resolver_correction.from,"electronics");
  assert.equal(report.spec.product,"crystalline-silicon solar photovoltaic module");assert.equal(report.validation.valid,true);
  const stages=report.supply_chain.stages.map(item=>item.title).join(" | ");const inputs=report.supply_chain.stages.flatMap(item=>item.inputs).join(" | ");
  for(const stage of ["Quartz","Polysilicon","wafer","cell","module","Inverter","Installation","Operations","recycling"])assert.match(stages,new RegExp(stage,"i"));
  for(const material of ["High-purity quartz","Solar-grade polysilicon","Solar glass","Aluminium frame stock","Silver paste feedstock","Copper","Encapsulant and backsheet polymers"])assert.match(inputs,new RegExp(material,"i"));
  assert.doesNotMatch(inputs,/Gold|Tin|Tantalum|Cobalt|Lithium|Rare earth/i);
  const foreground=report.supply_chain.stages.filter(item=>item.country_basis==="User-confirmed host geography");assert.deepEqual(foreground.map(item=>item.title),["PV module assembly"]);
});

test("solar validation blocks cross-product materials even when citations are present",async()=>{
  const spec={product:"solar panel",sectorKey:"solar_pv",sectorLabel:"Solar Photovoltaics",country:"India",region:"Gujarat",qty:10000,prompt:"Solar panel manufacturing in Gujarat, India"};
  const answers={site_status:"proposed",system_boundary:"cradle_to_grave",operating_scope:"module_assembly",pv_technology:"crystalline_silicon"};
  const result=await generate({spec,answers});const report=structuredClone(result.evidence_v2);report.supply_chain.stages[0].inputs.push("Gold");
  const checked=validate(report);assert.equal(checked.valid,false);assert.ok(checked.errors.some(item=>item.code==="solar_material_profile_leak"));
});

test("validator blocks incomplete or unsupported reports before persistence",async()=>{
  const result=await generate({spec:{...carSpec,answers:carAnswers}});const report=structuredClone(result.evidence_v2);
  report.supply_chain.stages[0].evidence.push("missing-source");const checked=validate(report);
  assert.equal(checked.valid,false);assert.equal(checked.exportable,false);assert.ok(checked.errors.some(item=>item.code==="unsupported_supply_chain_claim"));
});

test("validated report renderer retains the stage-by-risk heatmap",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","..","sycle-platform.html"),"utf8");
  assert.match(source,/stage-risk-heatmap/);
  assert.match(source,/Life-Cycle Stage &times; Social Risk/);
  assert.match(source,/DOL goods signal intersects/);
  assert.match(source,/Risk is not assessed, not low/);
  assert.match(source,/Green is reserved for an evidence-backed low-risk result/);
  assert.doesNotMatch(source,/id:"living_wage"[^\n]+moderate:\["working hours"/);
});

test("browser quantity parser does not treat modules as millions",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","..","sycle-platform.html"),"utf8");const body=source.match(/function parseQuantity\(text\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(body);const parseQuantity=Function(`${body}; return parseQuantity;`)();
  assert.equal(parseQuantity("producing 10,000 modules annually"),10000);
  assert.equal(parseQuantity("a 40 MW solar project"),40);
  assert.equal(parseQuantity("producing 2 million panels annually"),2000000);
});
