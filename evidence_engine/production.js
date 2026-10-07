"use strict";

const crypto = require("node:crypto");

const SOURCES = Object.freeze({
  unep:{id:"unep-2020",name:"Guidelines for Social Life Cycle Assessment of Products and Organizations",publisher:"UNEP Life Cycle Initiative",edition:"2020",url:"https://www.lifecycleinitiative.org/library/guidelines-for-social-life-cycle-assessment-of-products-and-organisations-2020/"},
  blsUnion:{id:"bls-union-2025",name:"Union affiliation by state",publisher:"U.S. Bureau of Labor Statistics",edition:"2025 annual averages",url:"https://www.bls.gov/news.release/union2.t05.htm"},
  blsLaus:{id:"bls-laus",name:"Local Area Unemployment Statistics",publisher:"U.S. Bureau of Labor Statistics",edition:"latest observation",url:"https://www.bls.gov/lau/"},
  wgi:{id:"world-bank-wgi",name:"Worldwide Governance Indicators",publisher:"World Bank",edition:"2025 revision; latest observation",url:"https://www.worldbank.org/en/publication/worldwide-governance-indicators"},
  wdi:{id:"world-bank-wdi",name:"World Development Indicators",publisher:"World Bank",edition:"latest observation",url:"https://databank.worldbank.org/source/world-development-indicators"},
  comtrade:{id:"un-comtrade",name:"UN Comtrade merchandise trade data",publisher:"United Nations Statistics Division",edition:"latest complete annual observation",url:"https://comtradeplus.un.org/"},
  dol:{id:"us-dol-goods-2024",name:"List of Goods Produced by Child Labor or Forced Labor",publisher:"U.S. Department of Labor ILAB",edition:"2024",url:"https://www.dol.gov/agencies/ilab/reports/child-labor/list-of-goods"},
  oecd:{id:"oecd-rbc-2018",name:"Due Diligence Guidance for Responsible Business Conduct",publisher:"OECD",edition:"2018",url:"https://mneguidelines.oecd.org/OECD-Due-Diligence-Guidance-for-Responsible-Business-Conduct.pdf"},
  naics:{id:"census-naics-2022",name:"North American Industry Classification System",publisher:"U.S. Census Bureau",edition:"2022",url:"https://www.census.gov/naics/"}
});

const COUNTRY = Object.freeze({
  "United States":["USA","842"],Germany:["DEU","276"],India:["IND","356"],Brazil:["BRA","076"],China:["CHN","156"],Mexico:["MEX","484"],Canada:["CAN","124"],Japan:["JPN","392"],"South Korea":["KOR","410"],France:["FRA","250"],Italy:["ITA","380"],"United Kingdom":["GBR","826"],Australia:["AUS","036"],Chile:["CHL","152"],Indonesia:["IDN","360"],Malaysia:["MYS","458"],Vietnam:["VNM","704"],Thailand:["THA","764"],Taiwan:["TWN","490"],Singapore:["SGP","702"],Bangladesh:["BGD","050"],Pakistan:["PAK","586"],Turkey:["TUR","792"],Peru:["PER","604"],Colombia:["COL","170"],Ethiopia:["ETH","231"],Ghana:["GHA","288"],"DR Congo":["COD","180"],"South Africa":["ZAF","710"],Botswana:["BWA","072"],Angola:["AGO","024"],Belgium:["BEL","056"],Switzerland:["CHE","756"],Netherlands:["NLD","528"],Spain:["ESP","724"],Poland:["POL","616"],Philippines:["PHL","608"],Cambodia:["KHM","116"],Argentina:["ARG","032"],Ireland:["IRL","372"]
});
const M49_NAME=Object.fromEntries(Object.entries(COUNTRY).map(([name,value])=>[String(Number(value[1])),name]));

const STATE_FIPS=Object.freeze({Alabama:"01",Alaska:"02",Arizona:"04",Arkansas:"05",California:"06",Colorado:"08",Connecticut:"09",Delaware:"10","District Of Columbia":"11",Florida:"12",Georgia:"13",Hawaii:"15",Idaho:"16",Illinois:"17",Indiana:"18",Iowa:"19",Kansas:"20",Kentucky:"21",Louisiana:"22",Maine:"23",Maryland:"24",Massachusetts:"25",Michigan:"26",Minnesota:"27",Mississippi:"28",Missouri:"29",Montana:"30",Nebraska:"31",Nevada:"32","New Hampshire":"33","New Jersey":"34","New Mexico":"35","New York":"36","North Carolina":"37","North Dakota":"38",Ohio:"39",Oklahoma:"40",Oregon:"41",Pennsylvania:"42","Rhode Island":"44","South Carolina":"45","South Dakota":"46",Tennessee:"47",Texas:"48",Utah:"49",Vermont:"50",Virginia:"51",Washington:"53","West Virginia":"54",Wisconsin:"55",Wyoming:"56"});

const PROFILES=Object.freeze({
  automotive:{hs:"8708",partners:["Canada","Mexico","China","Japan","Germany","South Korea"],stages:["Raw and processed materials","Major systems and components","Powertrain and energy system","Vehicle assembly and finishing","Outbound logistics","Use, service and repair","Dismantling and recycling"],topics:["occupational safety","freedom of association","responsible minerals","contract labour","end-of-life worker protection"]},
  electronics:{hs:"950450",partners:["China","Vietnam","Japan","Mexico","South Korea","Taiwan"],stages:["Mineral and feedstock extraction","Semiconductor fabrication","PCB and component manufacturing","Final assembly and test","Packaging","Distribution and retail","Repair and end-of-life"],topics:["responsible minerals","working hours","migrant recruitment fees","chemical exposure","informal e-waste"]},
  ev_battery:{hs:"850760",partners:["China","South Korea","Japan","Germany","Canada"],stages:["Mineral extraction","Refining and active materials","Electrode production","Cell manufacturing","Module and pack assembly","Distribution and integration","Second life and recycling"],topics:["child labour in mineral extraction","Indigenous rights","water stress","chemical exposure","thermal safety"]},
  diamond:{hs:"7102",partners:["India","Belgium","Botswana","South Africa","Canada"],stages:["Rough diamond extraction","Sorting and valuation","Trading and chain of custody","Planning and cutting","Polishing","Grading and certification","Distribution"],topics:["conflict financing","artisanal-mining safety","chain-of-custody integrity","security labour","consumer disclosure"]},
  textile:{hs:"61",partners:["China","Vietnam","Bangladesh","India","Turkey","Cambodia"],stages:["Fibre production","Spinning and yarn","Weaving or knitting","Dyeing and wet processing","Cut-make-trim","Distribution and retail","Reuse and end-of-life"],topics:["child and forced labour","living wage","working hours","freedom of association","chemical exposure"]},
  pharma:{hs:"30",partners:["India","China","Germany","Switzerland","Ireland","Singapore"],stages:["API and intermediate production","Formulation","Fill and finish","Quality control","Packaging and serialisation","Distribution","Patient use and disposal"],topics:["chemical exposure","contract labour","access to medicine","business ethics","waste handling"]},
  food:{hs:"0901",partners:["Brazil","Colombia","Vietnam","Ethiopia","Peru"],stages:["Nursery and farm inputs","Cultivation","Harvest","Primary processing","Export and logistics","Manufacturing or roasting","Retail and consumption"],topics:["child labour","seasonal labour","living income","land rights","agrochemical exposure"]},
  metals:{hs:"7108",partners:["Canada","Switzerland","Mexico","Peru","South Africa"],stages:["Extraction or recycled feedstock","Transport and aggregation","Smelting or refining","Purification and assay","Casting and storage","Distribution","Recovery and recycling"],topics:["artisanal-mining safety","forced and child labour","land rights","security labour","illicit trade"]},
  data_center:{hs:"8471",partners:["China","Mexico","Taiwan","Vietnam","Malaysia","South Korea"],stages:["Site and permitting","Civil construction","Power and cooling equipment","Servers and network equipment","Installation and commissioning","Operations and security","Hardware refresh and e-waste"],topics:["construction safety","contract labour","water and energy access","responsible minerals","informal e-waste"]},
  generic:{hs:null,partners:[],stages:["Primary inputs","Processing","Site operations","Distribution","Use","End-of-life"],topics:["worker safety","wage adequacy","contract labour","community grievance","supplier transparency"]}
});

const WEIGHTS=Object.freeze({workers:.2,local_communities:.15,society:.2,consumers:.1,value_chain_actors:.25,children:.1});
const cap=(n,min=0,max=100)=>Math.min(max,Math.max(min,n));
const round=(n,p=1)=>Math.round(n*10**p)/10**p;
const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const title=value=>String(value||"").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const strip=value=>String(value||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();

async function getText(url,{fetchImpl=fetch,timeout=9000}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
  try{const response=await fetchImpl(url,{headers:{"user-agent":"SYCLE evidence service/2.0"},signal:controller.signal});if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);return await response.text();}
  finally{clearTimeout(timer);}
}
async function getJson(url,options){return JSON.parse(await getText(url,options));}

function questions(spec){
  const output=[];
  if(spec.country==="United States"&&String(spec.region||"").toLowerCase()==="new york")output.push({id:"location_interpretation",text:"Does New York mean the state generally or New York City?",options:[{value:"state",label:"New York State"},{value:"city",label:"New York City"}]});
  output.push({id:"site_status",text:"What is the facility status?",options:[{value:"proposed",label:"Proposed"},{value:"construction",label:"Under construction"},{value:"operating",label:"Operating"}]});
  output.push({id:"system_boundary",text:"Which life-cycle boundary should this report use?",options:[{value:"cradle_to_grave",label:"Cradle to grave"},{value:"cradle_to_gate",label:"Cradle to gate"},{value:"gate_to_gate",label:"Site operations only"}]});
  output.push({id:"operating_scope",text:"How much manufacturing happens at the site?",options:[{value:"assembly_only",label:"Assembly only"},{value:"mixed",label:"Mixed make and buy"},{value:"vertically_integrated",label:"Vertically integrated"}]});
  if(spec.sectorKey==="automotive")output.push({id:"vehicle_variant",text:"Which vehicle type is being manufactured?",options:[{value:"ev",label:"Battery electric"},{value:"ice",label:"Combustion engine"},{value:"hybrid",label:"Hybrid"}]});
  return output.map(item=>({...item,required:true}));
}

async function worldBank(iso3,indicator,source,options){
  const url=`https://api.worldbank.org/v2/country/${iso3}/indicator/${indicator}?format=json&per_page=12`;
  const payload=await getJson(url,options);const row=Array.isArray(payload?.[1])?payload[1].find(item=>Number.isFinite(item.value)):null;
  return row?{value:Number(row.value),edition:String(row.date),url,source}:null;
}
async function stateUnemployment(region,options){
  const fips=STATE_FIPS[title(region)];if(!fips)return null;
  const url=`https://api.bls.gov/publicAPI/v2/timeseries/data/LASST${fips}0000000000003`;const payload=await getJson(url,options);
  const row=(payload?.Results?.series?.[0]?.data||[]).find(item=>item.value!=="-"&&Number.isFinite(Number(item.value)));
  return row?{value:Number(row.value),edition:`${row.periodName} ${row.year}${row.latest?" (preliminary)":""}`,url,source:SOURCES.blsLaus}:null;
}
async function stateUnion(region,options){
  const state=title(region);if(!STATE_FIPS[state])return null;const html=await getText(SOURCES.blsUnion.url,options);
  const row=(html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi)||[]).find(candidate=>strip(candidate).startsWith(`${state} `));if(!row)return null;
  const values=[...row.matchAll(/class="datavalue">\s*([^<]+)/gi)].map(match=>Number(match[1].replace(/,/g,"")));
  return values.length>=10&&Number.isFinite(values[7])?{value:values[7],edition:"2025 annual average",url:SOURCES.blsUnion.url,source:SOURCES.blsUnion}:null;
}
async function trade(spec,profile,options){
  const host=COUNTRY[spec.country];if(!host||!profile.hs||!profile.partners.length)return {rows:[],gap:"No supported trade classification."};
  const codes=profile.partners.map(name=>COUNTRY[name]?.[1]).filter(Boolean);const years=[new Date().getUTCFullYear()-1,new Date().getUTCFullYear()-2];
  for(const year of years){
    const common=`period=${year}&reporterCode=${host[1]}&cmdCode=${profile.hs}&flowCode=M&partner2Code=0&customsCode=C00&motCode=0&maxRecords=500`;
    const totalUrl=`https://comtradeapi.un.org/public/v1/preview/C/A/HS?${common}&partnerCode=0`;
    const partnerUrl=`https://comtradeapi.un.org/public/v1/preview/C/A/HS?${common}&partnerCode=${encodeURIComponent(codes.join(","))}`;
    try{
      const totalPayload=await getJson(totalUrl,options);const delay=options.tradeDelayMs??1050;if(delay)await new Promise(resolve=>setTimeout(resolve,delay));const partnerPayload=await getJson(partnerUrl,options);
      const total=Number(totalPayload?.data?.[0]?.primaryValue||0);const rows=(partnerPayload?.data||[]).map(item=>({country:M49_NAME[String(Number(item.partnerCode))]||`M49 ${item.partnerCode}`,trade_value_usd:Number(item.primaryValue||0),share:total?Number(item.primaryValue||0)/total*100:null,hs_code:profile.hs,period:String(year)})).filter(item=>item.trade_value_usd>0).sort((a,b)=>b.trade_value_usd-a.trade_value_usd);
      if(total&&rows.length)return {rows,total,period:String(year),hs:profile.hs,urls:[totalUrl,partnerUrl]};
    }catch(error){if(year===years.at(-1))return {rows:[],gap:`UN Comtrade retrieval failed: ${error.message}`};}
  }
  return {rows:[],gap:"UN Comtrade returned no usable observations."};
}

function sourceVersion(source,edition,retrievedAt,url,payload){return {...source,edition:edition||source.edition,url:url||source.url,retrieved_at:retrievedAt,checksum:hash(payload||{source:source.id,edition:edition||source.edition})};}
function evidence(id,name,value,unit,geography,source,extra={}){return {id:`ev-${id}`,indicator_id:id,name,value:round(value,extra.places??1),unit,geography,geo_level_used:extra.geoLevel||"country",is_fallback:!!extra.fallback,confidence:extra.confidence||"M",interpretation:extra.interpretation||"",value_text:extra.valueText||null,source};}

function score(indicators){
  const defs={union_membership_rate:["workers",v=>cap(v/30*100)],local_unemployment_rate:["local_communities",v=>cap(100-v/25*100)],control_of_corruption_estimate:["society",v=>cap((v+2.5)/5*100)],top_partner_import_share:["value_chain_actors",v=>cap(100-v)],child_forced_labour_goods_flag:["children",v=>v?0:null]};
  const trace=[];for(const item of indicators){const def=defs[item.indicator_id];if(!def)continue;const value=def[1](item.value);if(Number.isFinite(value))trace.push({pillar:def[0],score:round(value),weight:WEIGHTS[def[0]],evidence_ids:[item.id],formula:item.indicator_id});}
  const pillars=Object.fromEntries(Object.keys(WEIGHTS).map(pillar=>{const rows=trace.filter(row=>row.pillar===pillar);return [pillar,rows.length?round(rows.reduce((sum,row)=>sum+row.score,0)/rows.length):null];}));
  const rows=Object.entries(pillars).filter(([,value])=>Number.isFinite(value));const denominator=rows.reduce((sum,[pillar])=>sum+WEIGHTS[pillar],0);const overall=denominator?round(rows.reduce((sum,[pillar,value])=>sum+value*WEIGHTS[pillar],0)/denominator):null;
  return {pillars,overall,coverage:{scored_pillars:rows.length,total_pillars:6,percent:round(rows.length/6*100)},trace:{pillars:trace,weights:WEIGHTS,formula:"Weighted mean of available evidence-backed pillars; missing pillars are excluded and disclosed."},methodology:{name:"SYCLE screening evidence index",version:"2.0",activity_weighting:"Not available; no worker-hour weighting claim is made."}};
}

function labourSignals(spec){
  const signals=[];
  if((spec.sectorKey==="automotive"&&["ev","hybrid"].includes(spec.answers.vehicle_variant))||["electronics","ev_battery","data_center"].includes(spec.sectorKey))signals.push({good:"Cobalt ore",country:"DR Congo",issue:"Child-labour listing; actual supplier linkage is unverified."});
  if(spec.sectorKey==="textile")signals.push({good:"Cotton",country:"Listed producing countries",issue:"Child/forced-labour listing; actual supplier linkage is unverified."});
  if(spec.sectorKey==="food"&&/coffee/i.test(spec.product))signals.push({good:"Coffee",country:"Listed producing countries",issue:"Child/forced-labour listing; actual supplier linkage is unverified."});
  if(["diamond","metals"].includes(spec.sectorKey))signals.push({good:spec.sectorKey==="diamond"?"Diamonds":"Gold",country:"Listed producing countries",issue:"Child/forced-labour listing; actual supplier linkage is unverified."});
  return signals;
}

function supplyChain(spec,profile,sourcing,refs){
  const countries=sourcing.rows.slice(0,6).map(row=>row.country);const middle=Math.floor(profile.stages.length/2);
  return profile.stages.map((name,index)=>({id:`stage-${index+1}`,title:name,description:index===middle?`${title(spec.answers.operating_scope.replaceAll("_"," "))} at the foreground site.`:`Stage inferred from the ${spec.sectorLabel} process model.`,inputs:[spec.product],countries:index<middle?countries:index===middle?[spec.locationLabel]:[],country_basis:index<middle?(countries.length?`Observed ${sourcing.period} UN Comtrade partners for HS ${sourcing.hs}`:"Data gap"):index===middle?"User-confirmed host geography":"Not modelled",screening_topics:profile.topics.slice(index%profile.topics.length).concat(profile.topics).slice(0,3),evidence:index<middle&&countries.length?["ev-top_partner_import_share",SOURCES.naics.id,SOURCES.oecd.id]:[SOURCES.naics.id,SOURCES.oecd.id],confidence:index<middle&&countries.length?"M":"L"}));
}

function validate(report){
  const errors=[],warnings=[];const evidenceIds=new Set(report.indicators.map(item=>item.id));const refIds=new Set(report.references.map(item=>item.id));
  for(const ref of report.references)if(!/^https:\/\//.test(ref.url||"")||!ref.edition||!ref.checksum)errors.push({code:"invalid_reference",reference:ref.id});
  for(const item of report.indicators){if(!Number.isFinite(item.value)||!item.source?.url||!item.source?.edition)errors.push({code:"invalid_evidence",evidence:item.id});if(!refIds.has(item.source.id))errors.push({code:"orphan_evidence",evidence:item.id});}
  for(const stage of report.supply_chain.stages)for(const support of stage.evidence)if(!evidenceIds.has(support)&&!refIds.has(support))errors.push({code:"unsupported_supply_chain_claim",stage:stage.id,support});
  const allowed=new Set([report.spec.country,report.spec.region,report.spec.locationLabel,...report.sourcing.map(row=>row.country)].filter(Boolean));for(const stage of report.supply_chain.stages)for(const place of stage.countries)if(!allowed.has(place))errors.push({code:"foreign_geography",stage:stage.id,geography:place});
  const rows=report.scores.trace.pillars;const denominator=rows.reduce((sum,row)=>sum+row.weight,0);const recomputed=denominator?round(rows.reduce((sum,row)=>sum+row.score*row.weight,0)/denominator):null;if(Number.isFinite(report.scores.overall)&&Math.abs(recomputed-report.scores.overall)>.11)errors.push({code:"score_mismatch",published:report.scores.overall,recomputed});
  if(report.gaps.length)warnings.push({code:"declared_evidence_gaps",count:report.gaps.length});if(report.scores.coverage.scored_pillars<3)warnings.push({code:"insufficient_score_coverage"});
  return {valid:!errors.length,exportable:!errors.length&&report.indicators.length>=3&&report.scores.coverage.scored_pillars>=3,errors,warnings};
}

async function generate(input,options={}){
  const spec={...(input.spec||{}),answers:{...(input.answers||{})}};const missing=questions(spec).filter(item=>!spec.answers[item.id]);if(missing.length)return {status:"needs_clarification",questions:missing};
  const code=COUNTRY[spec.country];if(!code)return {status:"blocked",message:`No verified country-code mapping exists for ${spec.country}. No report was generated.`};
  spec.region=spec.answers.location_interpretation==="city"?"New York City":spec.region;spec.locationLabel=spec.region?`${spec.region}, ${spec.country}`:spec.country;const profile=PROFILES[spec.sectorKey]||PROFILES.generic;const retrievedAt=new Date().toISOString();const refs=new Map();refs.set(SOURCES.unep.id,sourceVersion(SOURCES.unep,null,retrievedAt));refs.set(SOURCES.naics.id,sourceVersion(SOURCES.naics,null,retrievedAt));refs.set(SOURCES.oecd.id,sourceVersion(SOURCES.oecd,null,retrievedAt));
  const tasks=[];if(spec.country==="United States"&&spec.region){const state=spec.region.replace(" City","");tasks.push(stateUnemployment(state,options).then(row=>({kind:"unemployment",row})).catch(error=>({kind:"unemployment",error})));tasks.push(stateUnion(state,options).then(row=>({kind:"union",row})).catch(error=>({kind:"union",error})));}else tasks.push(worldBank(code[0],"SL.UEM.TOTL.ZS",SOURCES.wdi,options).then(row=>({kind:"unemployment",row})).catch(error=>({kind:"unemployment",error})));
  tasks.push(worldBank(code[0],"GOV_WGI_CC_EST",SOURCES.wgi,options).then(row=>({kind:"governance",row})).catch(error=>({kind:"governance",error})));tasks.push(trade(spec,profile,options).then(row=>({kind:"trade",row})).catch(error=>({kind:"trade",error})));
  const results=await Promise.all(tasks);const indicators=[],gaps=[];let sourcing={rows:[],gap:"Trade evidence unavailable."};
  for(const result of results){if(result.error||!result.row){gaps.push({id:result.kind,reason:result.error?.message||"No observation returned"});continue;}if(result.kind==="trade"){sourcing=result.row;if(!sourcing.rows.length)gaps.push({id:"trade",reason:sourcing.gap});continue;}const row=result.row;if(!row){gaps.push({id:result.kind,reason:"No observation returned"});continue;}const source=sourceVersion(row.source,row.edition,retrievedAt,row.url,row);refs.set(source.id,source);if(result.kind==="union")indicators.push(evidence("union_membership_rate","Union membership rate",row.value,"percent",spec.region,source,{geoLevel:"state",interpretation:"State workforce proxy; not a facility unionisation rate."}));if(result.kind==="unemployment")indicators.push(evidence("local_unemployment_rate","Unemployment rate",row.value,"percent",spec.region||spec.country,source,{geoLevel:spec.region?"state":"country",interpretation:"Labour-market context; not a facility employment outcome."}));if(result.kind==="governance")indicators.push(evidence("control_of_corruption_estimate","Control of corruption estimate",row.value,"estimate (-2.5 to +2.5)",spec.country,source,{places:3,fallback:!!spec.region,interpretation:"Country proxy; not an operator assessment."}));}
  if(sourcing.rows.length){const top=sourcing.rows[0];const source=sourceVersion(SOURCES.comtrade,sourcing.period,retrievedAt,sourcing.urls[1],sourcing);refs.set(source.id,source);indicators.push(evidence("top_partner_import_share","Largest observed import-partner share",top.share,"percent",spec.country,source,{interpretation:`HS ${sourcing.hs}; ${top.country}. Trade proxy, not a facility supplier list.`}));}
  const signals=labourSignals(spec);if(signals.length){const source=sourceVersion(SOURCES.dol,null,retrievedAt);refs.set(source.id,source);indicators.push(evidence("child_forced_labour_goods_flag","DOL commodity risk signal",1,"boolean","Upstream commodity screening",source,{confidence:"L",interpretation:signals.map(item=>item.issue).join(" "),valueText:signals.map(item=>`${item.good}: ${item.country}`).join("; ")}));}
  const scores=score(indicators);const report={version:2,generated_at:retrievedAt,spec,indicators,sourcing:sourcing.rows,supply_chain:{stages:supplyChain(spec,profile,sourcing,refs)},scores,signals,gaps,assumptions:[{type:"USER_INPUT",field:"product",value:spec.product},{type:"USER_INPUT",field:"location",value:spec.locationLabel},{type:"USER_INPUT",field:"scale",value:spec.qty},...Object.entries(spec.answers).map(([field,value])=>({type:"USER_CONFIRMED",field,value})),{type:"MODEL_BOUNDARY",field:"trade_proxy",value:"UN Comtrade patterns are not treated as the facility supplier list."},{type:"MODEL_BOUNDARY",field:"screening_topics",value:"Potential topics are diligence prompts, not findings."}],references:[...refs.values()]};
  report.recommendations=[sourcing.rows.length?`Validate named suppliers against the observed ${sourcing.period} HS ${sourcing.hs} trade partners.`:"Obtain a supplier ledger with country of manufacture and material origin.",signals.length?"Trace flagged commodity-country combinations to mine, farm, smelter or processor level before making a finding.":"Screen actual materials against the current U.S. DOL goods list.","Collect site headcount, wages, hours, incidents, grievances, contractor controls and collective-bargaining coverage.","Replace each proxy with facility- or supplier-specific evidence and retain source editions and checksums."];
  report.validation=validate(report);report.quality={evidence_records:indicators.length,declared_gaps:gaps.length,scored_pillars:scores.coverage.scored_pillars,evidence_coverage_percent:scores.coverage.percent,exportable:report.validation.exportable,statement:report.validation.exportable?"Validated screening report. Primary-data verification remains required.":"Draft evidence report. Export is blocked until minimum evidence coverage is met."};return {status:"complete",evidence_v2:report};
}

module.exports={COUNTRY,PROFILES,SOURCES,generate,questions,score,validate};
