"use strict";

const crypto=require("node:crypto");
const {loadEvidenceBundle,regionKey}=require("./warehouse");
const {researchProduct}=require("./research");
const {fetchWorldBankContext,resolveGeography}=require("./research/world-bank");
const {createWarehouseClient}=require("./warehouse/client");
const {lifecycleCompatibility,profileCompatibility}=require("./product-identity");
const {buildAssessment,validateAssessment}=require("./assessment");

const COUNTRY=Object.freeze({
  "United States":["USA","842"],Germany:["DEU","276"],India:["IND","356"],Brazil:["BRA","076"],China:["CHN","156"],Mexico:["MEX","484"],Canada:["CAN","124"],Japan:["JPN","392"],"South Korea":["KOR","410"],France:["FRA","250"],Italy:["ITA","380"],"United Kingdom":["GBR","826"],Australia:["AUS","036"],Chile:["CHL","152"],Indonesia:["IDN","360"],Malaysia:["MYS","458"],Vietnam:["VNM","704"],Thailand:["THA","764"],Taiwan:["TWN","490"],Singapore:["SGP","702"],Bangladesh:["BGD","050"],Pakistan:["PAK","586"],Turkey:["TUR","792"],Peru:["PER","604"],Colombia:["COL","170"],Ethiopia:["ETH","231"],Ghana:["GHA","288"],"DR Congo":["COD","180"],"South Africa":["ZAF","710"],Botswana:["BWA","072"],Angola:["AGO","024"],Belgium:["BEL","056"],Switzerland:["CHE","756"],Netherlands:["NLD","528"],Spain:["ESP","724"],Poland:["POL","616"],Philippines:["PHL","608"],Cambodia:["KHM","116"],Argentina:["ARG","032"],Ireland:["IRL","372"]
});
const SECTOR_LABELS=Object.freeze({solar_pv:"Solar Photovoltaics",automotive:"Automotive / Vehicles",electronics:"Electronics / Consumer Hardware",ev_battery:"Battery Manufacturing",diamond:"Diamond Processing",textile:"Textile and Apparel",pharma:"Pharmaceuticals",food:"Food and Agriculture",metals:"Metals and Refining",data_center:"Data Centers"});
const PROFILES=Object.freeze(Object.fromEntries(Object.keys(SECTOR_LABELS).map(key=>[key,{sector_key:key,label:SECTOR_LABELS[key]}])));
const PRODUCT_SECTOR_RULES=Object.freeze([
  ["solar_pv",/\b(?:solar\s+(?:pv|photovoltaic|panel|module|power)|photovoltaic\s+(?:panel|module|plant|factory|manufactur(?:e|ing))|pv\s+(?:panel|module|manufactur(?:e|ing)))\b/i],
  ["data_center",/\b(?:data\s+cent(?:er|re)|server\s+farm|cloud\s+campus|hyperscale)\b/i],
  ["ev_battery",/\b(?:ev\s+batter(?:y|ies)|lithium(?:-ion)?\s+batter(?:y|ies)|battery\s+(?:cell|pack|gigafactory)|energy\s+storage)\b/i],
  ["diamond",/\b(?:diamond|gemstone|jewell?ery)\b/i],
  ["automotive",/\b(?:car|automobile|automotive|vehicle|truck|motorcycle)\b/i],
  ["textile",/\b(?:textile|apparel|garment|clothing|cotton|fabric|footwear)\b/i],
  ["pharma",/\b(?:pharma(?:ceutical)?|medicine|drug|vaccine|biotech|active pharmaceutical ingredient)\b/i],
  ["food",/\b(?:coffee|cocoa|plantation|agriculture|food processing|dairy|seafood)\b/i],
  ["metals",/\b(?:gold refinery|metal refinery|smelter|smelting|steel mill|copper refinery|aluminium refinery)\b/i],
  ["electronics",/\b(?:gaming console|computer|laptop|smartphone|phone|consumer electronics|printed circuit board|pcb|semiconductor device)\b/i]
]);
const SOLAR_FORBIDDEN_CORE_INPUTS=Object.freeze(["gold","tin","tantalum","cobalt","lithium","rare earth"]);
const WEIGHTS=Object.freeze({workers:.2,local_communities:.15,society:.2,value_chain_actors:.25,children:.1,consumers:.1});
const cap=(n,min=0,max=100)=>Math.min(max,Math.max(min,n));
const round=(n,p=1)=>Math.round(n*10**p)/10**p;
const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const title=value=>String(value||"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

function resolveProductSector(spec){
  const text=`${spec.product||""} ${spec.prompt||""}`;return PRODUCT_SECTOR_RULES.find(([,pattern])=>pattern.test(text))?.[0]||null;
}

function normaliseSector(spec){
  const productSector=resolveProductSector(spec),declared=spec.answers?.industry||spec.sectorKey||"generic";
  if(productSector){if(declared!==productSector)spec.resolver_correction={from:declared,to:productSector,basis:"Explicit product ontology match"};spec.sectorKey=productSector;}
  else spec.sectorKey=declared;
  spec.sectorLabel=SECTOR_LABELS[spec.sectorKey]||spec.sectorLabel||"General Manufacturing";return spec;
}

function questions(spec){
  const output=[];
  if(!spec.countryCode||!spec.region)output.push({id:"facility_location",input_type:"text",text:"What is the exact facility location?",placeholder:"City or state/region, country",reason:"Country and subnational geography determine the evidence and laws used in the report."});
  if(spec.country==="United States"&&String(spec.region||"").toLowerCase()==="new york")output.push({id:"location_interpretation",text:"Does New York mean the state generally or New York City?",options:[{value:"state",label:"New York State"},{value:"city",label:"New York City"}]});
  if(!spec.timeframe)output.push({id:"assessment_period",input_type:"text",text:"What year or assessment period should the evidence represent?",placeholder:"For example: 2026, or 2025-2027",reason:"Evidence dates and legal reference points must match the period being assessed."});
  output.push({id:"site_status",text:"What is the facility status?",options:[{value:"proposed",label:"Proposed"},{value:"construction",label:"Under construction"},{value:"operating",label:"Operating"}]});
  output.push({id:"system_boundary",text:"Which life-cycle boundary should this report use?",options:[{value:"cradle_to_grave",label:"Cradle to grave"},{value:"cradle_to_gate",label:"Cradle to gate"},{value:"gate_to_gate",label:"Site operations only"}]});
  const sector=spec.sectorKey;
  if(sector==="solar_pv"){
    output.push({id:"operating_scope",text:"Which solar-PV activity occurs at the stated location?",options:[{value:"module_assembly",label:"PV module assembly"},{value:"vertically_integrated",label:"Integrated PV manufacturing"},{value:"installation_operations",label:"Installation and operations"}]});
    output.push({id:"pv_technology",text:"Which photovoltaic module technology is in scope?",options:[{value:"crystalline_silicon",label:"Crystalline silicon"},{value:"cadmium_telluride",label:"Cadmium telluride (CdTe)"},{value:"cigs",label:"CIGS thin film"}]});
  }else{
    output.push({id:"operating_scope",text:"Which activity best describes the stated facility?",options:[{value:"assembly_only",label:"Assembly or final production"},{value:"mixed",label:"Mixed processing and assembly"},{value:"vertically_integrated",label:"Vertically integrated production"},{value:"primary_processing",label:"Extraction or primary processing"},{value:"service_operation",label:"Service or operating facility"}]});
    if(!spec.technology)output.push({id:"technology_route",input_type:"text",text:"What technology or process route is used?",placeholder:"Describe it, or enter Unknown if not yet selected",reason:"Technology choices change materials, worker exposures, process stages, and end-of-life routes."});
    if(sector==="automotive")output.push({id:"vehicle_variant",text:"Which vehicle type is being manufactured?",options:[{value:"ev",label:"Battery electric"},{value:"ice",label:"Combustion engine"},{value:"hybrid",label:"Hybrid"}]});
  }
  output.push({id:"co_products",input_type:"text",text:"Which co-products or by-products leave the system?",placeholder:"Enter None, or list each co-product",reason:"Co-products determine whether social inventory must be allocated between outputs."});
  output.push({id:"allocation_method",text:"Which allocation rule should apply?",options:[{value:"not_applicable",label:"Not applicable - no co-products"},{value:"mass",label:"Mass allocation"},{value:"economic",label:"Economic allocation"},{value:"other_physical",label:"Other physical relationship"}],reason:"Allocation choices affect every result and must be explicit."});
  return output.map(item=>({...item,required:true}));
}

function canonicalProduct(spec,profile){
  const text=`${spec.product||""} ${spec.prompt||""}`.toLowerCase();const patterns=[...(profile?.product_patterns||[])].sort((a,b)=>b.length-a.length);const matched=patterns.find(pattern=>new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\\ /g,"\\s+")}\\b`,"i").test(text));
  if(spec.sectorKey==="solar_pv")return {crystalline_silicon:"crystalline-silicon solar photovoltaic module",cadmium_telluride:"cadmium-telluride solar photovoltaic module",cigs:"CIGS solar photovoltaic module"}[spec.answers?.pv_technology]||"solar photovoltaic module";
  if(matched){if(spec.sectorKey==="automotive")return "car";if(spec.sectorKey==="diamond")return "diamond";if(spec.sectorKey==="ev_battery")return "lithium-ion battery";if(spec.sectorKey==="data_center")return "data center";return matched;}
  const cleaned=String(spec.product||"").replace(/\b(?:year|years|annual|annually|operation|operations|facility|factory|plant|manufacturing|production)\b/gi," ").replace(/\s+/g," ").trim();
  return cleaned.length>=3?cleaned:{automotive:"vehicle",electronics:"electronic product",ev_battery:"battery",diamond:"diamond",textile:"textile product",pharma:"pharmaceutical product",food:"agricultural product",metals:"refined metal",data_center:"data center"}[spec.sectorKey];
}

function sourceMap(bundle){
  const sources=new Map((bundle.sources||[]).map(item=>[item.id,item]));return new Map((bundle.source_versions||[]).map(version=>{const source=sources.get(version.source_id)||{};return [version.id,{id:version.id,name:source.name||version.source_id,publisher:source.publisher||"Unknown publisher",edition:version.edition,url:source.canonical_url||source.url,retrieved_at:version.retrieved_at,checksum:version.checksum}];}));
}

function bestRecords(records,spec){
  const stateKey=regionKey(spec),rank=key=>key===stateKey?0:key===spec.countryCode?1:2,selected=new Map();
  for(const row of [...records].sort((a,b)=>rank(a.geography_key)-rank(b.geography_key))){if(!selected.has(row.indicator_id))selected.set(row.indicator_id,row);}
  return [...selected.values()];
}

function indicator(row,references){
  const ref=references.get(row.source_version_id);return {id:row.id,indicator_id:row.indicator_id,name:row.indicator_name,value:Number(row.value),value_text:row.value_text,unit:row.unit,geography:row.geography_name,geo_level_used:row.geography_level,is_fallback:row.geography_level==="country",confidence:row.confidence,interpretation:row.interpretation,source:ref};
}

function dynamicIndicator(item){
  return {id:item.id,indicator_id:item.indicator_id,name:item.indicator_name,value:item.value===null?null:Number(item.value),value_text:item.value_text,unit:item.unit,geography:item.geography,geo_level_used:item.geography_level,is_fallback:["country","global"].includes(item.geography_level),confidence:item.confidence,interpretation:item.interpretation,observation_year:item.observation_year,locator:item.locator,quote_verified:item.quote_verified,source:item.source};
}

function workerScore(byId){
  const parts=[];const ids=[];const union=byId.get("union_membership_rate"),vulnerable=byId.get("vulnerable_employment"),female=byId.get("female_labor_participation"),male=byId.get("male_labor_participation");
  if(union){parts.push(cap(union.value/30*100));ids.push(union.id);}if(vulnerable){parts.push(cap(100-vulnerable.value));ids.push(vulnerable.id);}if(female&&male){parts.push(cap(100-Math.abs(male.value-female.value)*2));ids.push(female.id,male.id);}
  return parts.length?{score:round(parts.reduce((sum,value)=>sum+value,0)/parts.length),ids,formula:"Mean of available union representation, vulnerable-employment and labour-participation-parity context"}:null;
}

function score(indicators,originRecords=[],origins=[],claims=[]){
  const byId=new Map(indicators.map(item=>[item.indicator_id,item])),trace=[];const worker=workerScore(byId);if(worker)trace.push({pillar:"workers",score:worker.score,weight:WEIGHTS.workers,evidence_ids:worker.ids,formula:worker.formula});
  const unemployment=byId.get("unemployment_rate");if(unemployment)trace.push({pillar:"local_communities",score:round(cap(100-unemployment.value/25*100)),weight:WEIGHTS.local_communities,evidence_ids:[unemployment.id],formula:"100 - (unemployment rate / 25 x 100)"});
  const corruption=byId.get("control_of_corruption");if(corruption)trace.push({pillar:"society",score:round(cap((corruption.value+2.5)/5*100)),weight:WEIGHTS.society,evidence_ids:[corruption.id],formula:"World Bank control-of-corruption estimate normalised from -2.5..2.5 to 0..100"});
  const upstream=originRecords.filter(item=>["control_of_corruption","vulnerable_employment"].includes(item.indicator_id));const upstreamScores=upstream.map(item=>item.indicator_id==="control_of_corruption"?cap((Number(item.value)+2.5)/5*100):cap(100-Number(item.value))).filter(Number.isFinite);
  if(upstreamScores.length)trace.push({pillar:"value_chain_actors",score:round(upstreamScores.reduce((a,b)=>a+b,0)/upstreamScores.length),weight:WEIGHTS.value_chain_actors,evidence_ids:[...new Set(upstream.map(item=>item.source_version_id))],formula:"Unweighted mean of governance and vulnerable-employment context across benchmark material-origin geographies; not supplier performance"});
  const flags=originRecords.filter(item=>item.indicator_id==="child_forced_labour_goods_flag"&&origins.some(origin=>origin.material_key===item.dimensions?.material&&origin.country_code===item.country_code));const pairs=new Set(origins.map(origin=>`${origin.material_key}:${origin.country_code}`));
  if(flags.length&&pairs.size)trace.push({pillar:"children",score:round(cap(100-flags.length/pairs.size*100)),weight:WEIGHTS.children,evidence_ids:[...new Set(flags.map(item=>item.source_version_id))],formula:"Share of benchmark material-country combinations not appearing in the U.S. DOL goods signal; actual supplier linkage remains unverified"});
  const riskPerformance={low:85,moderate:65,high:40,critical:20};
  for(const pillar of Object.keys(WEIGHTS))if(!trace.some(item=>item.pillar===pillar)){
    const relevant=claims.filter(item=>item.claim_type==="social_risk"&&item.stakeholder===pillar&&item.retrieval_verified&&riskPerformance[item.risk_level]);if(!relevant.length)continue;
    trace.push({pillar,score:round(relevant.reduce((sum,item)=>sum+riskPerformance[item.risk_level],0)/relevant.length),weight:WEIGHTS[pillar],evidence_ids:relevant.map(item=>item.id),formula:"Deterministic conversion of evidence-linked qualitative risk levels: low 85, moderate 65, high 40, critical 20; unweighted screening context, not measured supplier performance"});
  }
  const pillars=Object.fromEntries(Object.keys(WEIGHTS).map(key=>[key,trace.find(item=>item.pillar===key)?.score??null]));const denominator=trace.reduce((sum,row)=>sum+row.weight,0);const overall=denominator?round(trace.reduce((sum,row)=>sum+row.score*row.weight,0)/denominator):null;
  return {pillars,overall,coverage:{scored_pillars:trace.length,total_pillars:6,percent:round(trace.length/6*100)},trace:{pillars:trace,weights:WEIGHTS,formula:"Weighted mean of evidence-backed screening pillars only; the consumer pillar is reported qualitatively until product-performance data are supplied."},methodology:{name:"SYCLE warehouse screening evidence index",version:"3.0",activity_weighting:"Unweighted screening context; no worker-hour or spend weighting is claimed."}};
}

function supplyChain(spec,profile,origins,references){
  const originsByMaterial=new Map();for(const origin of origins){const rows=originsByMaterial.get(origin.material_key)||[];rows.push(origin);originsByMaterial.set(origin.material_key,rows);}
  const isForeground=(stage,index)=>{
    if(spec.sectorKey==="solar_pv"){
      const scope=spec.answers?.operating_scope,titleText=stage.title.toLowerCase();
      if(scope==="module_assembly")return /module assembly/.test(titleText);
      if(scope==="installation_operations")return /installation|operations and maintenance/.test(titleText);
      if(scope==="vertically_integrated")return /polysilicon|ingot|wafer|cell|deposition|feedstock|module assembly/.test(titleText);
      return false;
    }
    return /foreground/i.test(stage.actor||"")||(/assembly|facility|fill-finish|cut-make-trim|roasting|smelting|installation/i.test(stage.title)&&index>=Math.floor(profile.profile.stages.length/2));
  };
  return profile.profile.stages.map((stage,index)=>{const matched=stage.materials.flatMap(material=>originsByMaterial.get(material)||[]);const countries=[...new Set(matched.map(item=>item.country_name))];const inputs=stage.materials.map(material=>matched.find(item=>item.material_key===material)?.material_name||title(material.replaceAll("_"," ")));const foreground=isForeground(stage,index);
    return {id:`stage-${index+1}`,title:stage.title,description:stage.description,inputs,countries:foreground?[spec.locationLabel]:countries,country_basis:foreground?"User-confirmed host geography":countries.length?"Versioned material-origin benchmark; not a supplier list":stage.logistics,evidence:[...new Set([...matched.map(item=>item.source_version_id),...profile.source_ids.slice(0,3)])].filter(id=>references.has(id)),screening_topics:stage.topics,logistics:stage.logistics,actor:stage.actor,foreground,confidence:foreground?"H":countries.length?"M":"L"};});
}

function validate(report){
  const errors=[],warnings=[];const evidenceIds=new Set(report.indicators.map(item=>item.id));const refIds=new Set(report.references.map(item=>item.id));const claimIds=new Set((report.claims||[]).map(item=>item.id));
  if(!report.spec.product||/\byear\s+(?:car|operation)\b/i.test(report.spec.product))errors.push({code:"invalid_product",product:report.spec.product});
  if(!report.product_resolution?.compatible)errors.push({code:"product_identity_unverified",requested_product:report.product_resolution?.requested_product||report.spec.product,resolved_product:report.product_resolution?.resolved_product||null});
  if(report.product_resolution?.source==="dynamic_research"&&!report.product_resolution.lifecycle_product?.compatible)errors.push({code:"researched_lifecycle_product_mismatch",requested_product:report.product_resolution.requested_product,resolved_product:report.product_resolution.resolved_product});
  const resolvedSector=resolveProductSector(report.spec);if(resolvedSector&&resolvedSector!==report.spec.sectorKey)errors.push({code:"product_sector_mismatch",resolved:resolvedSector,reported:report.spec.sectorKey});
  if(report.spec.sectorKey==="solar_pv"){
    const stages=report.supply_chain.stages||[],stageText=stages.map(stage=>stage.title).join(" | ").toLowerCase(),inputText=stages.flatMap(stage=>stage.inputs||[]).join(" | ").toLowerCase();
    const leaked=SOLAR_FORBIDDEN_CORE_INPUTS.filter(material=>inputText.includes(material));if(leaked.length)errors.push({code:"solar_material_profile_leak",materials:leaked});
    const technology=report.spec.answers?.pv_technology;if(!["crystalline_silicon","cadmium_telluride","cigs"].includes(technology))errors.push({code:"unresolved_pv_technology"});
    if(technology==="crystalline_silicon")for(const required of ["quartz","polysilicon","wafer","cell","module assembly","inverter","installation","operations","recycling"])if(!stageText.includes(required))errors.push({code:"incomplete_solar_process",stage:required});
  }
  if(!report.spec.locationLabel||!report.spec.countryCode)errors.push({code:"unresolved_geography"});
  if(!report.warehouse?.snapshot_id||!report.warehouse?.checksum)errors.push({code:"missing_warehouse_snapshot"});
  if(!report.supply_chain.stages.length||report.supply_chain.stages.some(stage=>!stage.description||!stage.logistics||!stage.screening_topics.length||!stage.evidence.length))errors.push({code:"incomplete_supply_chain"});
  for(const ref of report.references)if(!/^https:\/\//.test(ref.url||"")||!ref.edition||!ref.checksum)errors.push({code:"invalid_reference",reference:ref.id});
  for(const item of report.indicators)if(!Number.isFinite(item.value)||!item.source||!refIds.has(item.source.id))errors.push({code:"invalid_evidence",evidence:item.id});
  for(const stage of report.supply_chain.stages)for(const support of stage.evidence)if(!evidenceIds.has(support)&&!refIds.has(support)&&!claimIds.has(support))errors.push({code:"unsupported_supply_chain_claim",stage:stage.id,support});
  for(const claim of report.claims||[]){if(!claim.retrieval_verified)errors.push({code:"claim_without_retrieved_source",claim:claim.id});if(!claim.dataset_version_id)errors.push({code:"claim_without_dataset_version",claim:claim.id});}
  if(report.research?.validation&&!report.research.validation.valid)errors.push(...report.research.validation.errors);
  const rows=report.scores.trace.pillars,denominator=rows.reduce((sum,row)=>sum+row.weight,0),recomputed=denominator?round(rows.reduce((sum,row)=>sum+row.score*row.weight,0)/denominator):null;if(Number.isFinite(report.scores.overall)&&Math.abs(recomputed-report.scores.overall)>.11)errors.push({code:"score_mismatch",published:report.scores.overall,recomputed});
  if(report.scores.coverage.scored_pillars<4)warnings.push({code:"limited_quantitative_score_coverage",scored:report.scores.coverage.scored_pillars,total:6});
  if(report.indicators.filter(item=>["state","county","site"].includes(item.geo_level_used)).length===0&&report.spec.region)warnings.push({code:"national_geography_fallback",region:report.spec.region});
  if(!["supabase","dynamic_research"].includes(report.warehouse.mode))warnings.push({code:"warehouse_snapshot_fallback",snapshot:report.warehouse.snapshot_id});
  if(report.assessment){const assessmentValidation=validateAssessment(report.assessment);errors.push(...assessmentValidation.errors);warnings.push(...assessmentValidation.warnings);}
  return {valid:errors.length===0,exportable:errors.length===0,errors,warnings};
}

function recommendations(report){
  const list=[],stages=report.supply_chain.stages,highExposure=stages.filter(stage=>stage.countries.length&&stage.screening_topics.length).slice(0,3);if(highExposure.length)list.push(`Prioritise supplier traceability for ${highExposure.map(stage=>stage.title).join(", ")}; confirm country of manufacture and material origin against the benchmark lanes.`);
  if(report.signals.length)list.push(`Trace ${[...new Set(report.signals.map(item=>item.good))].join(", ")} to the mine, farm, processor or certified chain-of-custody record before making a supplier finding.`);
  list.push(`Collect ${report.spec.locationLabel} facility evidence for wages, hours, injuries, contractor controls, worker representation and grievance outcomes.`);
  list.push("Replace equal-weight material-origin context with purchase-spend, mass-flow or worker-hour weighting when the bill of materials and supplier ledger are available.");
  list.push("Verify product-safety, accessibility, complaint, recall and responsible-marketing evidence before scoring the consumer pillar.");return list;
}

async function persistReportSnapshot(report,input,options={}){
  const client=options.warehouseClient===undefined?createWarehouseClient(options):options.warehouseClient;if(!client)return null;
  const payload={product:report.spec.product,product_resolution:report.product_resolution,geography:{country:report.spec.country,region:report.spec.region,locality:report.spec.locality||null,country_code:report.spec.countryCode},request_data:{prompt:report.spec.prompt,answers:report.spec.answers,scale:report.spec.qty,boundary:report.spec.answers?.system_boundary},lifecycle:report.supply_chain,evidence_manifest:{warehouse:report.warehouse,references:report.references,claims:report.claims||[],datasets:report.datasets||[],measurements:report.measurements||[]},calculations:{assessment:report.assessment,legacy_screening_context:report.scores},assessment:report.assessment,review_status:report.assessment.review.status,validation:report.validation};
  const checksum=hash(payload),id=`report-snapshot-${checksum.slice(0,24)}`;await client.upsert("sycle_report_evidence_snapshots",[{id,user_id:input.user_id||null,...payload,checksum}]);return {id,checksum};
}

async function generate(input,options={}){
  const progress=async(status,percent,message)=>{if(options.onProgress)await options.onProgress({status,progress:percent,message});};
  await progress("resolving_product",8,"Resolving the exact product and facility geography");
  const spec=resolveGeography(normaliseSector({...(input.spec||{}),answers:{...(input.answers||{}),...(input.spec?.answers||{})}}));const missing=questions(spec).filter(item=>!spec.answers[item.id]);if(missing.length)return {status:"needs_clarification",questions:missing};
  spec.timeframe=spec.answers.assessment_period||spec.timeframe||null;spec.technology=spec.answers.technology_route||spec.technology||null;
  const code=COUNTRY[spec.country];if(!spec.countryCode&&code)spec.countryCode=code[0];
  if(spec.answers.location_interpretation==="city")spec.region="New York City";spec.locationLabel=spec.region?`${spec.region}, ${spec.country}`:spec.country;
  await progress("searching_library",20,"Searching SYCLE's verified evidence library");
  const requestedProduct=spec.product;let bundle=await loadEvidenceBundle(spec,{...options,requireSupabase:options.requireSupabase??false});let research=null,researchError=null;const cachedProduct=profileCompatibility(spec,bundle?.profile);const mustResearch=!cachedProduct.compatible;
  const dynamicEnabled=options.dynamicResearch!==false&&(mustResearch||Boolean(options.researchPlan)||options.refreshEvidence===true);
  if(mustResearch&&options.dynamicResearch===false)return {status:"blocked",code:"product_specific_research_required",message:`SYCLE has no verified lifecycle for ${requestedProduct}. Product-specific evidence research is required, and no other product template will be substituted. No report was saved.`,reason:bundle?.rejected_profile?.reason||cachedProduct.reason};
  if(dynamicEnabled){
    try{
      await progress("discovering_sources",38,"Finding product-specific process and evidence sources");
      research=await researchProduct(spec,spec.answers,bundle,options);if(research.status==="needs_clarification")return research;
      const intake=research.plan.intake;spec.product=intake.product;spec.sectorLabel=intake.industry;spec.country=intake.country;spec.countryCode=intake.country_code;spec.region=intake.region||intake.locality||spec.region||"";spec.locality=intake.locality||null;spec.locationLabel=[intake.locality,intake.region,intake.country].filter((value,index,array)=>value&&array.indexOf(value)===index).join(", ");spec.qty=intake.scale_value??spec.qty;spec.scaleUnit=intake.scale_unit||null;spec.timeframe=intake.timeframe||null;spec.classifications=intake.classifications;spec.facilityActivity=intake.facility_activity;spec.technology=intake.technology;
      bundle=await loadEvidenceBundle(spec,{...options,requireSupabase:options.requireSupabase??false})||bundle;
    }catch(error){
      researchError=error;
      if(mustResearch||options.requireDynamicResearch){
        const knownMessages={
          free_source_discovery_empty:"No retrievable product-process source was available from the current public-source connectors.",
          insufficient_product_process_evidence:"The retrieved sources did not provide enough distinct process stages.",
          product_research_mismatch:"The retrieved lifecycle did not match the requested product."
        };
        return {status:"blocked",code:error.code||"product_specific_research_failed",message:`SYCLE could not complete verified product-specific research for ${requestedProduct}. ${knownMessages[error.code]||"The retrieved evidence package did not pass validation."} Please retry. No report was saved.`,reason:error.details||error.code||"evidence_validation_failed"};
      }
    }
  }
  if(!research&&!bundle?.profile)return {status:"blocked",message:"SYCLE could not build a verified product lifecycle from the evidence library or live research. No report was saved.",reason:researchError?.message||"No matching product evidence"};
  if(!research)spec.product=canonicalProduct(spec,bundle.profile);
  await progress("retrieving_evidence",68,"Retrieving and versioning the supporting evidence");
  const warehouseClient=options.warehouseClient===undefined?createWarehouseClient(options):options.warehouseClient;let hostContext={measurements:[],references:[],datasets:[]},hostContextError=null;
  if(warehouseClient||options.fetchWorldBank)try{hostContext=await fetchWorldBankContext(spec,{fetchImpl:options.fetchImpl||fetch,client:warehouseClient});}catch(error){hostContextError=error;}
  const references=sourceMap(bundle||{sources:[],source_versions:[]});if(research)for(const ref of research.references)references.set(ref.id,ref);for(const ref of hostContext.references)references.set(ref.id,ref);
  const hostRows=bestRecords(bundle?.records||[],spec),warehouseIndicators=hostRows.filter(row=>row.indicator_id!=="child_forced_labour_goods_flag").map(row=>indicator(row,references));const allMeasurements=[...(research?.evidence.measurements||[]),...hostContext.measurements];const dynamicIndicators=allMeasurements.filter(item=>item.retrieval_verified&&Number.isFinite(item.value)).map(dynamicIndicator);
  const indicatorByKey=new Map(warehouseIndicators.map(item=>[item.indicator_id,item]));for(const item of dynamicIndicators)if(["facility","locality","region"].includes(item.geo_level_used)||!indicatorByKey.has(item.indicator_id))indicatorByKey.set(item.indicator_id,item);const indicators=[...indicatorByKey.values()];
  const scores=score(indicators,bundle?.origin_country_records||[],bundle?.material_origins||[],research?.evidence.claims||[]);const chain=research?research.stages:supplyChain(spec,bundle.profile,bundle.material_origins||[],references);
  const signals=(bundle?.origin_country_records||[]).filter(item=>item.indicator_id==="child_forced_labour_goods_flag"&&(bundle?.material_origins||[]).some(origin=>origin.material_key===item.dimensions?.material&&origin.country_code===item.country_code)).map(item=>({good:title(item.dimensions.material.replaceAll("_"," ")),country:item.geography_name,issue:`${item.dimensions.issue}; benchmark origin only, supplier linkage unverified.`,evidence_id:item.source_version_id}));
  const sourcingMap=new Map();for(const origin of bundle?.material_origins||[]){const item=sourcingMap.get(origin.country_name)||{country:origin.country_name,country_code:origin.country_code,materials:[],basis:origin.basis,source_version_id:origin.source_version_id};item.materials.push(origin.material_name);sourcingMap.set(origin.country_name,item);}if(research)for(const stage of chain)for(const country of stage.countries||[]){if(country===spec.locationLabel||country===spec.country||country===spec.region)continue;const item=sourcingMap.get(country)||{country,country_code:null,materials:[],basis:"Dynamic product-process evidence plan; supplier linkage unverified",source_version_id:null};item.materials.push(...stage.inputs);sourcingMap.set(country,item);}
  const warehouseSnapshot=bundle?.snapshot||{id:"no-warehouse-snapshot",generated_at:null,checksum:"none"},activeSnapshot=research?.research_snapshot||{id:warehouseSnapshot.id,generated_at:warehouseSnapshot.generated_at,checksum:warehouseSnapshot.checksum,mode:bundle?.warehouse_mode||"embedded_snapshot"};
  const productResolution=research?research.product_identity:{source:"cached_product_profile",requested_product:requestedProduct,resolved_product:spec.product,compatible:cachedProduct.compatible,profile_id:cachedProduct.profile_id,matched_pattern:cachedProduct.matched_pattern,lifecycle_product:lifecycleCompatibility(cachedProduct.matched_pattern||spec.product,chain)};
  await progress("building_report",88,"Building the structured S-LCA report");
  const report={version:5,generated_at:new Date().toISOString(),spec,product_resolution:productResolution,warehouse:{mode:activeSnapshot.mode,snapshot_id:activeSnapshot.id,generated_at:activeSnapshot.generated_at,checksum:activeSnapshot.checksum,base_snapshot_id:warehouseSnapshot.id,warning:bundle?.warehouse_warning||researchError?.message||hostContextError?.message||null},research:research?{mode:"warehouse_first_dynamic_research",plan_summary:research.plan.lifecycle.summary,evidence_requirements:research.plan.evidence_requirements,validation:research.validation,library_summary:research.research_snapshot.warehouse_summary}:null,indicators,measurements:allMeasurements,claims:research?.evidence.claims||[],datasets:[...(research?.evidence.datasets||[]),...hostContext.datasets],sourcing:[...sourcingMap.values()].map(item=>({...item,materials:[...new Set(item.materials)]})),supply_chain:{summary:research?.plan.lifecycle.summary||null,stages:chain},scores,signals,gaps:[],assumptions:[{type:"USER_INPUT",field:"product",value:spec.product},{type:"USER_INPUT",field:"location",value:spec.locationLabel},{type:"USER_INPUT",field:"scale",value:spec.qty},...Object.entries(spec.answers).map(([field,value])=>({type:"USER_CONFIRMED",field,value})),...(spec.resolver_correction?[{type:"SYSTEM_RESOLUTION",field:"industry",value:`${spec.resolver_correction.to}; corrected from ${spec.resolver_correction.from} using the explicit product ontology` }]:[]),{type:"BENCHMARK_BOUNDARY",field:"material_origins",value:"Evidence-retrieved production geographies are screening lanes, not the facility supplier list."},{type:"BENCHMARK_BOUNDARY",field:"upstream_weighting",value:"Origin-country context is equally weighted until spend, mass-flow or worker-hour data are supplied."}],references:[...references.values()]};
  report.assessment=buildAssessment({spec,stages:chain,indicators,claims:report.claims,references:report.references,signals});
  report.gaps=report.assessment.gaps;
  report.recommendations=report.assessment.recommendations;
  report.validation=validate(report);
  report.quality={evidence_records:report.assessment.evidence_inventory.length,declared_gaps:report.assessment.gaps.length,assessed_topics:report.assessment.coverage.assessed_topics,total_topics:report.assessment.materiality.length,reference_flows_calculated:report.assessment.coverage.reference_flows_calculated,exportable:report.validation.exportable,review_status:report.assessment.review.status,statement:report.validation.exportable?`${research?"Live-research and warehouse-backed":"Warehouse-backed"} draft assessment (${activeSnapshot.id}); analyst review is required.`:"Report generation blocked because the evidence contract was not met."};
  await progress("validating",96,"Checking product, geography, claims, scores, and citations");
  if(!report.validation.valid)return {status:"blocked",message:"SYCLE could not validate the report. No report was saved.",validation:report.validation,diagnostics:report.validation.errors.map(item=>item.code)};report.report_snapshot=await persistReportSnapshot(report,input,options);return {status:"complete",evidence_v2:report};
}

module.exports={COUNTRY,PROFILES,SECTOR_LABELS,generate,questions,resolveProductSector,score,validate};
