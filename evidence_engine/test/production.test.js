"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {generate,resolveProductSector,validate}=require("../production");
const {matchCountry,resolveGeography}=require("../research/world-bank");

const carSpec={product:"year Car operation",sectorKey:"automotive",sectorLabel:"Automotive / Vehicles",country:"United States",region:"New York",qty:4000,prompt:"4 year Car operation producing 4,000 units annually in New York"};
const commonAnswers={assessment_period:"2026",technology_route:"Unknown",co_products:"None",allocation_method:"not_applicable"};
const carAnswers={...commonAnswers,location_interpretation:"state",site_status:"proposed",system_boundary:"cradle_to_grave",operating_scope:"assembly_only",vehicle_variant:"ice"};

test("production generator asks every decision-critical question before warehouse lookup",async()=>{
  const result=await generate({spec:carSpec});
  assert.equal(result.status,"needs_clarification");
  assert.deepEqual(result.questions.map(item=>item.id),["location_interpretation","assessment_period","site_status","system_boundary","operating_scope","technology_route","vehicle_variant","co_products","allocation_method"]);
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
  const diamond=await generate({spec:{product:"diamond",sectorKey:"diamond",sectorLabel:"Diamond Processing",country:"India",region:"Gujarat",qty:100,prompt:"Diamond manufacturing in Gujarat, India",answers:{...commonAnswers,site_status:"operating",system_boundary:"cradle_to_grave",operating_scope:"mixed"}}});
  const car=await generate({spec:{...carSpec,answers:carAnswers}});
  assert.equal(diamond.status,"complete");assert.equal(car.status,"complete");
  assert.notDeepEqual(diamond.evidence_v2.supply_chain.stages.map(item=>item.title),car.evidence_v2.supply_chain.stages.map(item=>item.title));
  assert.match(diamond.evidence_v2.supply_chain.stages[0].title,/diamond/i);assert.doesNotMatch(JSON.stringify(diamond.evidence_v2),/cotton/i);
});

test("generic products use universal intake instead of a fixed industry menu",async()=>{
  const result=await generate({spec:{product:"manufactured product",sectorKey:"generic",sectorLabel:"General Manufacturing",country:"Germany",region:"",qty:1000,prompt:"Build an S-LCA in Germany"}});
  assert.equal(result.status,"needs_clarification");assert.equal(result.questions[0].id,"facility_location");assert.equal(result.questions[0].input_type,"text");assert.equal(result.questions.some(item=>item.id==="industry"),false);
});

test("unresolved geography returns an intake question instead of reaching validation",async()=>{
  const spec={product:"gaming console",sectorKey:"electronics",country:null,region:"",qty:5000,prompt:"Build a gaming console factory producing 5,000 units annually near Springfield",rawLocationText:"Build a gaming console factory producing 5,000 units annually near Springfield"};
  const first=await generate({spec});assert.equal(first.status,"needs_clarification");assert.equal(first.questions[0].id,"facility_location");
  const second=await generate({spec,answers:{...commonAnswers,facility_location:"Springfield, Illinois, United States",site_status:"operating",system_boundary:"cradle_to_grave",operating_scope:"assembly_only"}},{dynamicResearch:false,warehouseClient:null});
  assert.equal(second.status,"complete");assert.equal(second.evidence_v2.spec.countryCode,"USA");assert.match(second.evidence_v2.spec.locationLabel,/Springfield, Illinois/);
});

test("universal research builds an evidence-linked lifecycle for a product outside cached profiles",async()=>{
  const socialRisks=[
    ["c1","Paper mill workers face occupational safety risks.","workers","high"],
    ["c2","Forestry sourcing can affect local land access.","local_communities","moderate"],
    ["c3","Chain-of-custody governance requires verification.","society","moderate"],
    ["c4","Contractor conditions require supplier diligence.","value_chain_actors","high"],
    ["c5","Child-labour controls are required in informal collection.","children","high"],
    ["c6","Packaging safety and claims affect consumers.","consumers","low"]
  ];
  const claims=socialRisks.map(([id,statement,stakeholder,risk_level],index)=>({id,statement,claim_type:"social_risk",source_ids:["s1"],evidence_quote:`Verified evidence phrase ${index+1}`,locator:`Section ${index+1}`,geography:index<2?"Kenya":null,publication_year:2025,confidence:"H",stakeholder,risk_level}));
  const stages=["Forestry and recovered fibre","Pulp production","Paper production","Corrugating and converting","Distribution and recovery"].map((title,index)=>({id:`stage-${index+1}`,title,description:`Product-specific ${title.toLowerCase()} process for corrugated packaging production.`,inputs:[index?"Intermediate paper material":"Wood fibre and recovered paper"],outputs:[index===4?"Recovered packaging":"Processed paper intermediate"],actor:index===3?"Foreground facility":"Value-chain operator",foreground:index===3,likely_countries:index===3?[]:["Kenya"],social_risks:[socialRisks[index][1]],logistics:"Documented road and regional freight movement",claim_ids:[socialRisks[index][0]]}));
  const researchPlan={intake:{product:"corrugated paper box",industry:"Paper and packaging manufacturing",facility_activity:"Corrugating and box converting",technology:null,country:"Kenya",country_code:"KEN",region:"Nairobi County",locality:"Nairobi",scale_value:100000,scale_unit:"boxes/year",timeframe:"2026",boundary:"cradle_to_grave",classifications:{isic:["1702"],naics:["322211"],hs:["481910"]}},clarification_questions:[],lifecycle:{summary:"A fibre-to-recovery lifecycle specific to corrugated paper packaging.",stages},evidence_requirements:stages.map((stage,index)=>({id:`req-${index}`,stage_ids:[stage.id],topic:"social risk",geography_level:index===3?"region":"supply_chain_country",preferred_source_types:["official_document"],search_query:`official corrugated paper ${stage.title} social risk Kenya`})),sources:[
    {id:"s1",title:"Official paper sector evidence",publisher:"Government agency",url:"https://example.gov/paper",dataset_url:null,publication_year:2025,source_type:"official_document",licence_name:"U.S. government public data",licence_url:null,complete_dataset_available:false,authority_reason:"Government publication"},
    {id:"s2",title:"World development evidence",publisher:"World Bank",url:"https://www.worldbank.org/paper",dataset_url:null,publication_year:2025,source_type:"official_dataset",licence_name:"CC BY 4.0",licence_url:null,complete_dataset_available:false,authority_reason:"Official multilateral dataset"},
    {id:"s3",title:"Labour evidence",publisher:"ILO",url:"https://www.ilo.org/paper",dataset_url:null,publication_year:2025,source_type:"official_dataset",licence_name:"ILO open data",licence_url:null,complete_dataset_available:false,authority_reason:"Official labour dataset"}
  ],claims,measurements:[],recommendations:[0,1,2].map(index=>({title:`Action ${index+1}`,action:`Implement verified control ${index+1} for the paper supply chain.`,rationale:`Addresses evidence-backed issue ${index+1} in this assessment.`,priority:index?"near_term":"immediate",claim_ids:[`c${index+1}`]}))};
  const fetchImpl=async()=>new Response(`<html>${socialRisks.map((_,index)=>`Verified evidence phrase ${index+1}`).join(". ")}</html>`,{status:200,headers:{"content-type":"text/html"}});
  const spec={product:"corrugated paper box",sectorKey:"generic",sectorLabel:"General Manufacturing",country:"Kenya",region:"Nairobi",qty:100000,prompt:"Build an S-LCA for a corrugated paper box factory producing 100,000 boxes per year in Nairobi, Kenya",answers:{...commonAnswers,site_status:"operating",system_boundary:"cradle_to_grave",operating_scope:"mixed"}};
  const result=await generate({spec},{researchPlan,fetchImpl,warehouseClient:null});assert.equal(result.status,"complete");
  const report=result.evidence_v2;assert.equal(report.version,5);assert.equal(report.spec.product,"corrugated paper box");assert.equal(report.spec.countryCode,"KEN");assert.equal(report.warehouse.mode,"dynamic_research");assert.equal(report.supply_chain.stages.length,5);assert.equal(report.claims.length,6);assert.equal(report.validation.valid,true);assert.equal(report.scores.coverage.scored_pillars,6);assert.match(report.supply_chain.stages.map(item=>item.title).join(" | "),/Corrugating and converting/);
  assert.equal(report.assessment.method.aggregation,"No overall score is published; stage-topic scores remain separate.");
  assert.ok(report.assessment.research_matrix.length>=report.supply_chain.stages.length);
  assert.ok(report.assessment.materiality.every(item=>item.status==="gap"?item.score===null:Boolean(item.benchmark&&item.evidence_ids.length)));
});

test("Supabase warehouse lookup keeps the country-code argument before AI geography resolution",async()=>{
  const {supabaseBundle}=require("../warehouse");let body=null;
  const fetchImpl=async(_url,init)=>{body=JSON.parse(init.body);return new Response(JSON.stringify({snapshot:{id:"snapshot"},profile:null,records:[],material_origins:[],origin_country_records:[],source_versions:[],sources:[]}),{status:200,headers:{"content-type":"application/json"}});};
  const bundle=await supabaseBundle({countryCode:null,sectorKey:"generic",answers:{}},{fetchImpl,env:{SYCLE_SUPABASE_URL:"https://example.supabase.co",SYCLE_SUPABASE_SERVICE_ROLE_KEY:"test"}});
  assert.equal(bundle.warehouse_mode,"supabase");assert.equal(Object.hasOwn(body,"p_country_code"),true);assert.equal(body.p_country_code,null);
});

test("ISO geography resolution supports countries and cities outside the original UI list",()=>{
  assert.deepEqual(matchCountry("Estonia"),{country:"Estonia",countryCode:"EST"});
  assert.deepEqual(matchCountry("DR Congo"),{country:"DR Congo",countryCode:"COD"});
  const spec=resolveGeography({country:null,region:"",prompt:"Gaming console manufacturing in Kathmandu, Nepal",rawLocationText:"Gaming console manufacturing in Kathmandu, Nepal"});
  assert.equal(spec.country,"Nepal");assert.equal(spec.countryCode,"NPL");assert.equal(spec.region,"Kathmandu");assert.equal(spec.locationLabel,"Kathmandu, Nepal");
});

test("World Bank fallback completes a cited report when the warehouse lacks host-country rows",async()=>{
  const values={"SL.UEM.TOTL.ZS":10.4,"SL.EMP.VULN.ZS":76.9,"SL.TLF.CACT.FE.ZS":27.4,"SL.TLF.CACT.MA.ZS":52.9,"CC.EST":-0.7};
  const fetchImpl=async url=>{const code=Object.keys(values).find(item=>String(url).includes(`/indicator/${item}?`));return new Response(JSON.stringify([{page:1,pages:1},code?[{indicator:{id:code,value:code==="CC.EST"?"Control of Corruption: Estimate":"World Bank labour indicator"},country:{id:"NP",value:"Nepal"},countryiso3code:"NPL",date:"2025",value:values[code]}]:[]]),{status:200,headers:{"content-type":"application/json"}});};
  const spec={product:"gaming console",sectorKey:"electronics",country:null,region:"",qty:5000,prompt:"Build an S-LCA for a gaming console factory producing 5,000 consoles annually in Kathmandu, Nepal",rawLocationText:"Build an S-LCA for a gaming console factory producing 5,000 consoles annually in Kathmandu, Nepal",answers:{...commonAnswers,site_status:"operating",system_boundary:"cradle_to_grave",operating_scope:"assembly_only"}};
  const result=await generate({spec},{dynamicResearch:false,warehouseClient:null,fetchWorldBank:true,fetchImpl});assert.equal(result.status,"complete");
  const report=result.evidence_v2;assert.equal(report.spec.locationLabel,"Kathmandu, Nepal");assert.equal(report.spec.countryCode,"NPL");assert.equal(report.validation.valid,true);assert.ok(report.scores.coverage.scored_pillars>=4);assert.equal(report.indicators.some(item=>item.source?.publisher==="World Bank"),true);
});

test("explicit solar products override a stale electronics classification before questions",async()=>{
  const spec={product:"solar photovoltaic module",sectorKey:"electronics",sectorLabel:"Electronics / Consumer Hardware",country:"India",region:"Gujarat",qty:10000,prompt:"Solar panel manufacturing facility producing 10,000 modules annually in Gujarat, India"};
  assert.equal(resolveProductSector(spec),"solar_pv");
  const result=await generate({spec});
  assert.equal(result.status,"needs_clarification");
  assert.deepEqual(result.questions.map(item=>item.id),["assessment_period","site_status","system_boundary","operating_scope","pv_technology","co_products","allocation_method"]);
  assert.match(result.questions.find(item=>item.id==="operating_scope").text,/solar-PV/i);
});

test("crystalline-silicon solar reports use the PV chain and reject electronics BOM leakage",async()=>{
  const spec={product:"solar power",sectorKey:"electronics",sectorLabel:"Electronics / Consumer Hardware",country:"India",region:"Gujarat",qty:10000,prompt:"Solar panel manufacturing facility producing 10,000 modules annually in Gujarat, India"};
  const answers={...commonAnswers,site_status:"proposed",system_boundary:"cradle_to_grave",operating_scope:"module_assembly",pv_technology:"crystalline_silicon"};
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
  const answers={...commonAnswers,site_status:"proposed",system_boundary:"cradle_to_grave",operating_scope:"module_assembly",pv_technology:"crystalline_silicon"};
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
