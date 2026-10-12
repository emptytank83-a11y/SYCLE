"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {embeddedBundle}=require("../warehouse");
const {lifecycleCompatibility,profileCompatibility}=require("../product-identity");
const {generate}=require("../production");
const {supabaseBundle}=require("../warehouse");

const answers={assessment_period:"2026",site_status:"operating",system_boundary:"cradle_to_grave",operating_scope:"mixed",technology_route:"Unknown",co_products:"None",allocation_method:"not_applicable"};

test("a broad sector match cannot substitute a different product lifecycle",()=>{
  const coffee=embeddedBundle({product:"coffee",prompt:"Coffee processing in Brazil",sectorKey:"food",countryCode:"BRA",answers}).profile;
  assert.ok(coffee);
  const match=profileCompatibility({product:"sugar",prompt:"Sugar factory in the United Kingdom"},coffee);
  assert.equal(match.compatible,false);
  assert.equal(match.matched_pattern,null);
});

test("warehouse retrieval returns no product profile or materials for an unseen product",()=>{
  const bundle=embeddedBundle({product:"sugar",prompt:"Sugar factory in the United Kingdom",sectorKey:"food",countryCode:"GBR",answers});
  assert.equal(bundle.profile,null);
  assert.equal(bundle.material_origins.length,0);
  assert.match(bundle.rejected_profile.reason,/different product/i);
});

test("cache misses require product-specific research instead of a nearby template",async()=>{
  const result=await generate({spec:{product:"sugar",prompt:"Sugar factory in London, United Kingdom",sectorKey:"food",country:"United Kingdom",countryCode:"GBR",region:"London",qty:1000,answers}},{dynamicResearch:false,warehouseClient:null});
  assert.equal(result.status,"blocked");
  assert.equal(result.code,"product_specific_research_required");
  assert.doesNotMatch(JSON.stringify(result),/coffee beans|nursery and farm inputs/i);
});

test("lifecycle identity validation is product-agnostic",()=>{
  const wrong=[{title:"Nursery and farm inputs",description:"Coffee seedling production",inputs:["Coffee beans"],outputs:["Green coffee"]}];
  const right=[{title:"Pulp production",description:"Pulping recovered fibre for corrugated packaging",inputs:["Wood fibre"],outputs:["Paper reels"]}];
  assert.equal(lifecycleCompatibility("sugar",wrong).compatible,false);
  assert.equal(lifecycleCompatibility("corrugated paper box",right).compatible,true);
});

test("a rejected remote profile cannot leak its materials or country risks",async()=>{
  const remote={snapshot:{id:"s",checksum:"c"},profile:{id:"coffee",product_patterns:["coffee"],profile:{stages:[]}},records:[{id:"host",sector_key:null,source_version_id:"host-v"},{id:"coffee-row",sector_key:"food",source_version_id:"coffee-v"}],material_origins:[{material_key:"coffee",country_code:"BRA"}],origin_country_records:[{dimensions:{material:"coffee"},country_code:"BRA"}],source_versions:[{id:"host-v",source_id:"host"},{id:"coffee-v",source_id:"coffee"}],sources:[{id:"host"},{id:"coffee"}]};
  const fetchImpl=async()=>new Response(JSON.stringify(remote),{status:200,headers:{"content-type":"application/json"}}),bundle=await supabaseBundle({product:"sugar",prompt:"Sugar factory",sectorKey:"food",countryCode:"GBR",answers:{}},{fetchImpl,env:{SYCLE_SUPABASE_URL:"https://example.supabase.co",SYCLE_SUPABASE_SERVICE_ROLE_KEY:"test"}});
  assert.equal(bundle.profile,null);assert.deepEqual(bundle.material_origins,[]);assert.deepEqual(bundle.origin_country_records,[]);assert.deepEqual(bundle.records.map(item=>item.id),["host"]);assert.deepEqual(bundle.sources.map(item=>item.id),["host"]);
});
