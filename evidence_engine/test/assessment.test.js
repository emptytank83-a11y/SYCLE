"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {buildAssessment,buildMateriality,qualityGrade,validateAssessment}=require("../assessment");

const spec={product:"beet sugar",qty:1000,scaleUnit:"tonnes/year",country:"United Kingdom",countryCode:"GBR",region:"East Anglia",locationLabel:"East Anglia, United Kingdom",answers:{system_boundary:"cradle_to_gate",co_products:"beet pulp, molasses",allocation_method:"economic"}};
const stages=[
  {id:"farm",title:"Sugar beet cultivation",description:"Cultivation and harvest of sugar beet.",inputs:["Sugar beet seed"],countries:["United Kingdom"],foreground:false,screening_topics:["seasonal labour","worker safety"],evidence:["claim-farm"],logistics:"Farm to factory"},
  {id:"factory",title:"Sugar processing",description:"Washing, slicing, diffusion, purification and crystallisation.",inputs:["Sugar beet"],countries:[spec.locationLabel],foreground:true,screening_topics:["worker safety","living wage"],evidence:["claim-factory"],logistics:"Foreground processing"}
];
const references=[{id:"official-2025",publisher:"UK Government official statistics",source_type:"official_dataset",url:"https://example.gov/data",edition:"2025"}];
const claims=[{id:"claim-farm",statement:"Seasonal agricultural labour requires documented working-time controls.",source_ids:["official-2025"],evidence_quote:"Seasonal agricultural labour requires documented working-time controls.",locator:"Table 4",geography:"United Kingdom",publication_year:2025,quote_verified:true,retrieval_verified:true,stakeholder:"workers",risk_level:"moderate",claim_type:"social_risk"}];

test("assessment creates the stage-stakeholder-indicator-geography research matrix",()=>{
  const assessment=buildAssessment({spec,stages,claims,references});
  assert.ok(assessment.research_matrix.some(item=>item.stage_id==="farm"&&item.required_indicator&&item.required_geography&&item.search_query.includes("beet sugar")));
  assert.equal(assessment.reference_flows.functional_unit.quantity,1000);
  assert.equal(assessment.allocation.required,true);
  assert.equal(assessment.allocation.method,"economic");
  assert.equal(assessment.method.aggregation,"No overall score is published; stage-topic scores remain separate.");
});

test("missing evidence remains a gap and can never become a green or neutral score",()=>{
  const rows=buildMateriality(stages,[],[]);
  assert.ok(rows.length>0);
  assert.ok(rows.every(item=>item.status==="gap"&&item.score===null&&item.benchmark===null));
  assert.equal(validateAssessment(buildAssessment({spec,stages,references})).valid,true);
});

test("every proposed reference-scale result carries evidence, a benchmark, rationale and quality grade",()=>{
  const assessment=buildAssessment({spec,stages,claims,references});
  const assessed=assessment.materiality.filter(item=>item.status==="assessed");
  assert.ok(assessed.length>0);
  assert.ok(assessed.every(item=>Number.isFinite(item.score)&&item.score>=-2&&item.score<=2&&item.benchmark&&item.rationale&&item.evidence_ids.length&&/^[A-D]$/.test(item.quality_grade)));
  assert.equal(validateAssessment(assessment).valid,true);
});

test("data quality distinguishes direct official evidence from unverified qualitative evidence",()=>{
  const official={publisher:"Government official statistics",source_type:"official_dataset"};
  assert.equal(qualityGrade({source:official,geography_level:"facility",claim_type:"measurement",quote_verified:true,retrieval_verified:true,publication_year:2026},spec,2026),"A");
  assert.equal(qualityGrade({source:{publisher:"Unknown"},geography_level:"global",claim_type:"social_risk",quote_verified:false,retrieval_verified:false,publication_year:null},spec,2026),"D");
});
