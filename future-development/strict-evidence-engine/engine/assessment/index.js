"use strict";

const {referenceScore}=require("../discovery/score");

const crypto=require("node:crypto");

const STAKEHOLDERS=Object.freeze({
  workers:["health_and_safety","fair_salary","working_hours","forced_labour","freedom_of_association","equal_opportunities","job_security"],
  local_communities:["local_employment","safe_living_conditions","land_and_resource_rights","community_engagement","cultural_heritage"],
  value_chain_actors:["fair_competition","supplier_relationships","responsible_sourcing","technology_development"],
  consumers:["health_and_safety","feedback_mechanisms","privacy","transparency","end_of_life_responsibility"],
  society:["corruption","public_commitments","economic_development","regulatory_compliance"],
  children:["child_labour","education","health_and_safety_as_consumers"]
});

const TOPIC_RULES=Object.freeze([
  [/child|young worker/i,["children","child_labour"]],
  [/forced|recruitment fee|bonded/i,["workers","forced_labour"]],
  [/wage|salary|income|pay/i,["workers","fair_salary"]],
  [/hour|overtime|temporary labour|seasonal labour|contract labour/i,["workers","working_hours"]],
  [/association|union|collective|grievance|speak-up/i,["workers","freedom_of_association"]],
  [/gender|diversity|equal opportun|discrimination/i,["workers","equal_opportunities"]],
  [/job security|closure|redundanc/i,["workers","job_security"]],
  [/safety|injur|exposure|ergonomic|heat|dust|chemical|machinery|fire/i,["workers","health_and_safety"]],
  [/land|tenure|indigenous|displacement|resettlement/i,["local_communities","land_and_resource_rights"]],
  [/land|indigenous|community|water|noise|traffic|displacement|heritage/i,["local_communities","safe_living_conditions"]],
  [/local employment/i,["local_communities","local_employment"]],
  [/supplier|traceability|chain of custody|chain-of-custody|smallholder|fair competition/i,["value_chain_actors","responsible_sourcing"]],
  [/corruption|governance|conflict financing|sanction|illicit/i,["society","corruption"]],
  [/consumer|product safety|privacy|accessibility|marketing|complaint/i,["consumers","health_and_safety"]],
  [/recycl|end.of.life|waste/i,["consumers","end_of_life_responsibility"]]
]);

const RISK_SCORE=Object.freeze({critical:-2,high:-2,moderate:-1,low:0});
const QUALITY_SPREAD=Object.freeze({A:0,B:1,C:1,D:2});
const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const normalise=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const clampScore=value=>Math.max(-2,Math.min(2,Number(value)));

function topicIdentity(topic){
  const match=TOPIC_RULES.find(([pattern])=>pattern.test(String(topic||"")));
  return match?{stakeholder:match[1][0],subcategory:match[1][1]}:{stakeholder:"value_chain_actors",subcategory:"responsible_sourcing"};
}

function qualityGrade({source={},geography_level,claim_type,quote_verified,retrieval_verified,publication_year},spec,nowYear=new Date().getFullYear()){
  const age=publication_year?Math.max(0,nowYear-Number(publication_year)):null;
  const official=/government|official|statistics|world bank|ilo|united nations|oecd|regulator|inspectorate/i.test(`${source.publisher||""} ${source.source_type||""}`);
  const direct=["facility","site","locality"].includes(geography_level),regional=geography_level==="region",country=geography_level==="country";
  if(retrieval_verified&&quote_verified&&official&&direct&&(age===null||age<=3))return "A";
  if(retrieval_verified&&official&&(regional||country)&&(age===null||age<=5))return "B";
  if(retrieval_verified&&(official||source.source_type==="academic")&&(age===null||age<=8))return "C";
  if(claim_type==="process"&&retrieval_verified&&quote_verified)return "C";
  return "D";
}

function applicability(grade,geographyLevel,claimType){
  if(["facility","site"].includes(geographyLevel))return "facility_direct";
  if(["locality","region"].includes(geographyLevel))return "subnational_proxy";
  if(geographyLevel==="country")return "country_proxy";
  if(claimType==="process")return "product_process_only";
  return grade==="D"?"qualitative_screening":"sector_proxy";
}

function typedEvidence(indicators=[],claims=[],references=[],spec={}){
  const referenceById=new Map(references.map(item=>[item.id,item]));
  const observations=indicators.map((item,index)=>{
    const source=item.source||{},publicationYear=item.observation_year||Number(item.source?.edition)||null;
    const grade=qualityGrade({source,geography_level:item.geo_level_used,claim_type:"measurement",quote_verified:item.quote_verified!==false,retrieval_verified:true,publication_year:publicationYear},spec);
    return {id:item.id||`observation-${index+1}`,kind:"measurement",indicator_id:item.indicator_id,name:item.name,value:item.value,value_text:item.value_text||null,unit:item.unit,year:publicationYear,geography:item.geography,geography_level:item.geo_level_used,stage_id:null,stage_ids:item.context?.stage_ids||null,context:item.context||null,stakeholder:item.context?.stakeholder||indicatorStakeholder(item.indicator_id),subcategory:item.context?.subcategory||indicatorSubcategory(item.indicator_id),source_id:source.id||null,source_url:source.url||null,locator:item.locator||"Dataset observation",evidence_quote:item.evidence_quote||item.interpretation||`${item.name}: ${item.value} ${item.unit}`,quality_grade:grade,applicability:applicability(grade,item.geo_level_used,"measurement"),confidence:item.confidence,interpretation:item.interpretation||null};
  });
  observations.push(...claims.map((claim,index)=>{
    const source=referenceById.get(claim.source_ids?.[0])||{},grade=qualityGrade({source,geography_level:claim.geography?"country":"global",claim_type:claim.claim_type,quote_verified:claim.quote_verified,retrieval_verified:claim.retrieval_verified,publication_year:claim.publication_year},spec);
    const identity=topicIdentity(`${claim.statement} ${claim.risk_level||""}`);
    return {id:claim.id||`claim-${index+1}`,kind:"claim",indicator_id:null,name:claim.statement,value:null,value_text:claim.statement,unit:"qualitative",year:claim.publication_year||null,geography:claim.geography||"Product/process context",geography_level:claim.geography?"country":"global",stage_id:claim.lifecycle_stage_id||null,stakeholder:claim.stakeholder||identity.stakeholder,subcategory:identity.subcategory,source_id:source.id||claim.source_ids?.[0]||null,source_url:source.url||null,locator:claim.locator,evidence_quote:claim.evidence_quote,quality_grade:grade,applicability:applicability(grade,claim.geography?"country":"global",claim.claim_type),confidence:claim.confidence,risk_level:claim.risk_level||null,interpretation:claim.statement};
  }));
  return observations;
}

function indicatorStakeholder(id){
  if(/unemployment/i.test(id||""))return "local_communities";
  if(/female|male|union|vulnerable|wage|injur|employment/i.test(id||""))return "workers";
  if(/corruption|governance/i.test(id||""))return "society";
  if(/child|forced/i.test(id||""))return "children";
  return "value_chain_actors";
}
function indicatorSubcategory(id){
  if(/injur/i.test(id||""))return "health_and_safety";
  if(/female|male/i.test(id||""))return "equal_opportunities";
  if(/union/i.test(id||""))return "freedom_of_association";
  if(/unemployment/i.test(id||""))return "local_employment";
  if(/corruption/i.test(id||""))return "corruption";
  if(/child|forced/i.test(id||""))return "child_labour";
  return "responsible_sourcing";
}

function buildResearchMatrix(stages=[],spec={}){
  const rows=[];
  for(const stage of stages)for(const topic of stage.screening_topics||[]){const identity=topicIdentity(topic),geography=stage.foreground?spec.locationLabel:(stage.countries||[]).join(" OR ")||"documented supply-chain geography";rows.push({id:`requirement-${hash([stage.id,topic]).slice(0,12)}`,stage_id:stage.id,stage:stage.title,topic,stakeholder:identity.stakeholder,subcategory:identity.subcategory,required_indicator:requiredIndicator(identity.subcategory),required_geography:stage.foreground?"facility_or_subnational":"documented_supply_chain_geography",preferred_source_tier:stage.foreground?"A":"A_or_B",preferred_source_classes:["official statistics","labour regulator","law or regulation","sector body","peer-reviewed research"],search_query:`${spec.product} ${stage.title} ${topic} ${geography}`,status:"planned"});}
  for(const stakeholder of Object.keys(STAKEHOLDERS))if(!rows.some(row=>row.stakeholder===stakeholder)){const topic=STAKEHOLDERS[stakeholder][0].replaceAll("_"," ");rows.push({id:`requirement-${hash([stakeholder,spec.product]).slice(0,12)}`,stage_id:null,stage:"Cross-cutting",topic,stakeholder,subcategory:STAKEHOLDERS[stakeholder][0],required_indicator:requiredIndicator(STAKEHOLDERS[stakeholder][0]),required_geography:"facility_or_relevant_market",preferred_source_tier:"A_or_B",preferred_source_classes:["official statistics","regulator","law or regulation","sector body"],search_query:`${spec.product} ${topic} ${spec.locationLabel||spec.country||""}`,status:"planned"});}
  return rows;
}

function requiredIndicator(subcategory){
  return ({health_and_safety:"injury/fatality rate or verified controls",fair_salary:"wage compared with legal and living-wage PRPs",working_hours:"hours and overtime compared with legal limits",forced_labour:"recruitment fees, coercion and forced-labour controls",freedom_of_association:"representation and grievance evidence",equal_opportunities:"representation and pay-gap evidence",job_security:"employment change and contract security",local_employment:"jobs or local procurement per functional unit",safe_living_conditions:"traffic, emissions, water, noise or community health evidence",land_and_resource_rights:"land tenure and consultation evidence",community_engagement:"documented engagement and grievance outcomes",responsible_sourcing:"supplier traceability and due-diligence evidence",corruption:"governance or enforcement evidence",child_labour:"product-country child-labour evidence",end_of_life_responsibility:"collection and recovery performance"})[subcategory]||"topic-specific quantitative or documented qualitative evidence";
}

function buildReferenceFlows(spec,stages,observations){
  const quantity=Number(spec.qty),unit=spec.scaleUnit||"units/year",flows=[{id:"flow-functional-output",stage_id:stages.find(stage=>stage.foreground)?.id||stages.at(-1)?.id||null,quantity:Number.isFinite(quantity)?quantity:null,unit,flow:`${spec.product} output`,formula:Number.isFinite(quantity)?"User-provided annual production":"Missing functional-unit quantity",inputs:Number.isFinite(quantity)?[quantity]:[],result:Number.isFinite(quantity)?`${quantity.toLocaleString()} ${unit}`:"gap",status:Number.isFinite(quantity)?"user_provided":"gap",evidence_ids:[]}];
  for(const stage of stages){const inputs=(stage.inputs||[]).filter(item=>normalise(item)!==normalise(spec.product));for(const input of inputs.slice(0,6)){const supporting=observations.find(item=>item.stage_id===stage.id&&Number.isFinite(item.value)&&/ratio|yield|conversion|throughput|mass/i.test(`${item.name} ${item.interpretation}`));flows.push({id:`flow-${hash([stage.id,input]).slice(0,14)}`,stage_id:stage.id,quantity:supporting&&Number.isFinite(quantity)?quantity*supporting.value:null,unit:supporting?.unit||"conversion factor required",flow:input,formula:supporting?`Functional unit × ${supporting.value} ${supporting.unit}`:"Functional unit × verified product-to-input conversion factor",inputs:supporting?[quantity,supporting.value]:[quantity].filter(Number.isFinite),result:supporting&&Number.isFinite(quantity)?`${quantity*supporting.value} ${supporting.unit}`:"gap",status:supporting?"calculated":"gap",evidence_ids:supporting?[supporting.id]:[]});}}
  return {functional_unit:{quantity:Number.isFinite(quantity)?quantity:null,unit,product:spec.product,period:"annual",boundary:spec.answers?.system_boundary||"not confirmed",location:spec.locationLabel},flows};
}

function benchmarkFor(observation,observations=[]){
  if(observation.context?.discovery_verified&&observation.context.kind==="indicator"&&observation.context.direction){
    const bench=observations.find(item=>item.indicator_id===`${observation.indicator_id}:benchmark`&&Number.isFinite(item.value));
    if(bench&&bench.source_id===observation.source_id&&bench.value===observation.value&&bench.year===observation.year)return null;
    const result=bench&&referenceScore({value:observation.value,benchmark:bench.value,direction:observation.context.direction,unit:observation.unit,benchmarkUnit:bench.unit});
    if(result&&result.score!==null)return {type:"discovered_reference",label:`${bench.geography} ${bench.name}: ${bench.value} ${bench.unit}${bench.year?` (${bench.year})`:""}`,value:bench.value,unit:bench.unit,source_id:bench.source_id,evidence_id:bench.id,score:()=>result.score,formula:`${result.formula}; ${result.thresholds}`};
  }
  if(observation.indicator_id==="control_of_corruption")return {type:"scale_midpoint",label:"World Bank WGI neutral scale point",value:0,unit:"estimate",source_id:observation.source_id,score:value=>value>=1.5?2:value>=.5?1:value>=0?0:value>=-1?-1:-2};
  if(observation.indicator_id==="child_forced_labour_goods_flag")return {type:"due_diligence_expectation",label:"No product-country child/forced-labour signal",value:0,unit:"flag",source_id:observation.source_id,score:value=>Number(value)===0?0:-2};
  return null;
}

function buildMateriality(stages,observations,signals=[]){
  const rows=[];
  for(const stage of stages)for(const topic of stage.screening_topics||[]){
    const identity=topicIdentity(topic),stageEvidence=observations.filter(item=>item.stage_id===stage.id||stage.evidence?.includes(item.id)||stage.evidence?.includes(item.source_id)||(stage.foreground&&!item.context?.discovery_verified&&["facility","site","locality","region","country"].includes(item.geography_level))||(item.context?.discovery_verified&&item.stage_ids?.includes(stage.id)&&item.subcategory===identity.subcategory)).filter(item=>item.stakeholder===identity.stakeholder),riskClaim=stageEvidence.find(item=>item.risk_level&&RISK_SCORE[item.risk_level]!==undefined),numeric=stageEvidence.find(item=>benchmarkFor(item,observations));let score=null,benchmark=null,rationale="";
    if(riskClaim&&!numeric?.context?.discovery_verified){score=RISK_SCORE[riskClaim.risk_level];benchmark={type:"evidence_risk_classification",label:"Evidence-linked qualitative risk classification",value:"low / moderate / high / critical",unit:"category",source_id:riskClaim.source_id};rationale=`${riskClaim.risk_level} evidence signal for ${topic}; this is a screening classification, not a facility finding.`;}
    else if(numeric){const benchmarkRule=benchmarkFor(numeric,observations);score=benchmarkRule.score(numeric.value);benchmark={...benchmarkRule};delete benchmark.score;delete benchmark.evidence_id;rationale=`${numeric.name} is ${numeric.value} ${numeric.unit}, compared with ${benchmark.label}. Applicability: ${numeric.applicability}.`;}
    const intersect=signals.find(signal=>(stage.inputs||[]).some(input=>normalise(input)===normalise(signal.good))&&(stage.countries||[]).some(country=>normalise(country)===normalise(signal.country)));
    if(intersect&&identity.stakeholder==="children"){score=-2;benchmark={type:"due_diligence_expectation",label:"No product-country child/forced-labour signal",value:0,unit:"flag",source_id:intersect.evidence_id};rationale=`Stored product-country labour signal intersects ${intersect.good} / ${intersect.country}; supplier linkage remains unverified.`;}
    const evidenceIds=[...new Set(stageEvidence.map(item=>item.id).concat(intersect?[intersect.evidence_id]:[]))],grade=stageEvidence.length?stageEvidence.map(item=>item.quality_grade).sort().at(-1):"D";
    rows.push({id:`materiality-${hash([stage.id,topic]).slice(0,14)}`,stage_id:stage.id,stage:stage.title,topic,stakeholder:identity.stakeholder,subcategory:identity.subcategory,screening_decision:"included",decision_reason:`The product-specific stage model identifies ${topic} as a potentially material topic for ${stage.title}.`,status:Number.isFinite(score)?"assessed":"gap",score:Number.isFinite(score)?clampScore(score):null,benchmark,rationale:Number.isFinite(score)?rationale:`No stage-specific observation and explicit performance reference point were retrieved for ${topic}.`,quality_grade:grade,evidence_ids:evidenceIds,review_status:"proposed"});
  }
  const governance=observations.find(item=>item.indicator_id==="control_of_corruption");
  if(governance){const benchmarkRule=benchmarkFor(governance),score=benchmarkRule.score(governance.value),benchmark={...benchmarkRule};delete benchmark.score;rows.push({id:`materiality-${hash(["host-context","corruption"]).slice(0,14)}`,stage_id:null,stage:"Host-country context",topic:"governance and corruption context",stakeholder:"society",subcategory:"corruption",screening_decision:"included",decision_reason:"Host-country governance affects permitting, enforcement and due-diligence design.",status:"assessed",score,benchmark,rationale:`${governance.name} is ${governance.value}, compared with the published WGI neutral scale point. This is country context, not operator performance.`,quality_grade:governance.quality_grade,evidence_ids:[governance.id],review_status:"proposed"});}
  for(const item of observations.filter(o=>o.context?.discovery_verified&&o.context.kind==="indicator"&&!(o.stage_ids||[]).length)){
    const rule=benchmarkFor(item,observations);if(!rule)continue;
    const benchmark={...rule};delete benchmark.score;delete benchmark.evidence_id;
    rows.push({id:`materiality-${hash(["host-context",item.indicator_id]).slice(0,14)}`,stage_id:null,stage:"Host-country context",topic:item.name,stakeholder:item.stakeholder,subcategory:item.subcategory,screening_decision:"included",decision_reason:"Host-country indicator found for a stakeholder pillar that no stage topic covered.",status:"assessed",score:rule.score(item.value),benchmark,rationale:`${item.name} is ${item.value} ${item.unit}, compared with ${benchmark.label}. This is country context, not operator performance.`,quality_grade:item.quality_grade,evidence_ids:[item.id,rule.evidence_id].filter(Boolean),review_status:"proposed"});
  }
  const female=observations.find(item=>item.indicator_id==="female_labor_participation"),male=observations.find(item=>item.indicator_id==="male_labor_participation");
  if(female&&male){const gap=Math.abs(Number(male.value)-Number(female.value)),score=gap<=5?1:gap<=10?0:gap<=20?-1:-2;rows.push({id:`materiality-${hash(["host-context","participation-parity"]).slice(0,14)}`,stage_id:null,stage:"Host labour-market context",topic:"gender participation parity",stakeholder:"workers",subcategory:"equal_opportunities",screening_decision:"included",decision_reason:"External labour-market participation affects recruitment access and workforce-diversity planning.",status:"assessed",score,benchmark:{type:"analytical_parity_reference",label:"Female and male labour-force participation gap: 0 percentage points",value:0,unit:"percentage-point gap",source_id:null},rationale:`The published participation gap is ${Math.round(gap*10)/10} percentage points. This is national context, not a facility pay-equity or representation result.`,quality_grade:[female.quality_grade,male.quality_grade].sort().at(-1),evidence_ids:[female.id,male.id],review_status:"proposed"});}
  return rows;
}

function buildSensitivity(materiality,allocation){
  const assessed=materiality.filter(item=>Number.isFinite(item.score));
  const scenario=direction=>assessed.map(item=>{const spread=QUALITY_SPREAD[item.quality_grade]??2;return {...item,score:clampScore(item.score+(direction==="low"?-spread:direction==="high"?spread:0))};});
  const rank=rows=>rows.slice().sort((a,b)=>a.score-b.score).map(item=>item.id);
  const base=rank(assessed),low=rank(scenario("low")),high=rank(scenario("high"));
  return {scenarios:[{id:"base",label:"Base evidence",description:"Published evidence and confirmed scope",scores:assessed.map(item=>({id:item.id,score:item.score}))},{id:"quality_low",label:"Conservative data-quality bound",description:"Scores reduced according to A-D evidence uncertainty",scores:scenario("low").map(item=>({id:item.id,score:item.score}))},{id:"quality_high",label:"Optimistic data-quality bound",description:"Scores increased according to A-D evidence uncertainty",scores:scenario("high").map(item=>({id:item.id,score:item.score}))}],hotspot_ranking_stable:JSON.stringify(base.slice(0,5))===JSON.stringify(low.slice(0,5))&&JSON.stringify(base.slice(0,5))===JSON.stringify(high.slice(0,5)),allocation_sensitivity:allocation.required?"Alternative allocation requires co-product quantity and value data":"Not applicable unless co-products are present"};
}

function buildAssessment({spec,stages=[],indicators=[],claims=[],references=[],signals=[]}){
  const observations=typedEvidence(indicators,claims,references,spec),research_matrix=buildResearchMatrix(stages,spec).map(requirement=>{const stage=stages.find(item=>item.id===requirement.stage_id),matches=observations.filter(item=>(!requirement.stage_id||item.stage_id===requirement.stage_id||stage?.evidence?.includes(item.id)||stage?.evidence?.includes(item.source_id))&&item.stakeholder===requirement.stakeholder);return {...requirement,status:matches.length?"evidence_retrieved":"gap",evidence_ids:matches.map(item=>item.id)};}),reference_flows=buildReferenceFlows(spec,stages,observations),materiality=buildMateriality(stages,observations,signals),rawCoProducts=String(spec.answers?.co_products||"").trim(),coProducts=rawCoProducts.split(/,|;/).map(item=>item.trim()).filter(Boolean),confirmedNone=/^(none|no|not applicable|n\/a)$/i.test(rawCoProducts),hasCoProducts=coProducts.length&&!confirmedNone;
  const allocation={required:Boolean(hasCoProducts),co_products:hasCoProducts?coProducts:[],method:spec.answers?.allocation_method||"not_confirmed",basis:!rawCoProducts?"Co-products have not been confirmed.":hasCoProducts?"User confirmation and co-product quantity/value evidence required before allocated results are final.":"The user confirmed that no co-products are in scope; allocation is not applied.",status:!rawCoProducts?"confirmation_required":hasCoProducts&&spec.answers?.allocation_method?"confirmed_method_missing_factors":hasCoProducts?"gap":"not_required"};
  const sensitivity=buildSensitivity(materiality,allocation),gaps=[...reference_flows.flows.filter(item=>item.status==="gap").map(item=>({id:item.id,section:"reference_flow",stage_id:item.stage_id,reason:`Missing conversion factor for ${item.flow}`,required_data:"Product-specific quantity or conversion ratio",status:"gap"})),...materiality.filter(item=>item.status==="gap").map(item=>({id:item.id,section:"impact_assessment",stage_id:item.stage_id,reason:item.rationale,required_data:requiredIndicator(item.subcategory),status:"gap"}))];
  const screening_register=[];for(const [stakeholder,topics] of Object.entries(STAKEHOLDERS))for(const subcategory of topics){const matches=materiality.filter(item=>item.stakeholder===stakeholder&&item.subcategory===subcategory);screening_register.push({stakeholder,subcategory,decision:matches.length?"included":"gap",reason:matches.length?`Included in ${matches.length} stage or context assessment row(s).`:"No product-stage evidence was retrieved that would support inclusion or defensible exclusion.",materiality_ids:matches.map(item=>item.id)});}
  const scored=materiality.filter(item=>Number.isFinite(item.score)),hotspots=scored.filter(item=>item.score<0).sort((a,b)=>a.score-b.score),recommendations=(hotspots.length?hotspots:gaps.slice(0,6)).slice(0,8).map((item,index)=>({priority:index<2?"immediate":index<5?"near_term":"monitor",stage_id:item.stage_id,topic:item.topic||item.required_data,action:item.status==="gap"?`Collect ${item.required_data} and compare it with an explicit performance reference point.`:`Implement and verify controls for ${item.topic}; track the supporting indicator against its stated benchmark.`,rationale:item.rationale||item.reason,indicator_to_track:item.topic||item.required_data,evidence_ids:item.evidence_ids||[]}));
  return {method:{framework:"UNEP S-LCA Guidelines 2020",standard:"ISO 14075:2024 aligned screening",impact_assessment:"Reference Scale Approach (Type I)",score_scale:{"+2":"Strongly positive","+1":"Moderately positive","0":"Meets reference point / neutral","-1":"Moderate negative","-2":"High negative / hotspot"},aggregation:"No overall score is published; stage-topic scores remain separate.",data_quality:{A:"Direct official or verified facility/subnational evidence",B:"Official sector or country evidence with close applicability",C:"Credible proxy, academic, company or process evidence",D:"Qualitative screening or weak proxy"}},research_matrix,reference_flows,evidence_inventory:observations,screening_register,materiality,allocation,sensitivity,gaps,recommendations,review:{status:"analyst_review_required",generated_by:"SYCLE evidence engine",score_signoff_required:true,reviewer_id:null,reviewed_at:null,changes:[]},coverage:{requirements:research_matrix.length,observations:observations.length,assessed_topics:scored.length,gap_topics:materiality.length-scored.length,reference_flows_calculated:reference_flows.flows.filter(item=>item.status!=="gap").length,reference_flow_gaps:reference_flows.flows.filter(item=>item.status==="gap").length},hotspots:hotspots.slice(0,10)};
}

function validateAssessment(assessment){
  const errors=[],warnings=[];
  if(!assessment?.research_matrix?.length)errors.push({code:"missing_research_matrix"});
  if(!assessment?.reference_flows?.functional_unit)errors.push({code:"missing_functional_unit"});
  if(!assessment?.materiality?.length)errors.push({code:"missing_materiality_screening"});
  for(const item of assessment?.materiality||[]){if(item.status==="assessed"&&(!Number.isFinite(item.score)||!item.benchmark||!item.evidence_ids.length||!item.rationale))errors.push({code:"unsupported_reference_scale_score",item:item.id});if(item.status==="gap"&&item.score!==null)errors.push({code:"gap_assigned_score",item:item.id});}
  if(assessment?.method?.aggregation!=="No overall score is published; stage-topic scores remain separate.")errors.push({code:"unapproved_score_aggregation"});
  if(assessment?.review?.status!=="approved")warnings.push({code:"human_review_required"});
  if(assessment?.gaps?.length)warnings.push({code:"declared_evidence_gaps",count:assessment.gaps.length});
  return {valid:errors.length===0,errors,warnings};
}

module.exports={STAKEHOLDERS,buildAssessment,buildMateriality,buildReferenceFlows,buildResearchMatrix,qualityGrade,topicIdentity,typedEvidence,validateAssessment};
