"use strict";

const {topicIdentity}=require("../assessment");
const {starterHostsFor}=require("./trust");

// One generic indicator per UNEP subcategory. Country, sector and product are filled in per report, so the
// same table serves every country; nothing here is specific to a place.
const INDICATORS=Object.freeze({
  "workers.health_and_safety":{id:"occupational_fatal_injury_rate",name:"Occupational fatal injury rate",terms:"fatal occupational injury rate per 100,000 workers",benchmark:"all-industry average fatal occupational injury rate",unit:"per 100,000 workers",direction:"lower_is_better",tag:"safety"},
  "workers.fair_salary":{id:"minimum_wage_level",name:"Statutory minimum wage",terms:"statutory minimum wage hourly or monthly",benchmark:"living wage or median wage",unit:"currency per period",direction:"higher_is_better",tag:"wages"},
  "workers.working_hours":{id:"weekly_working_hours",name:"Usual weekly working hours",terms:"average usual weekly hours worked and legal maximum working hours",benchmark:"statutory maximum weekly working hours",unit:"hours per week",direction:"lower_is_better",tag:"hours"},
  "workers.forced_labour":{id:"forced_labour_prevalence",name:"Forced labour prevalence",terms:"forced labour prevalence or modern slavery estimate",benchmark:"global forced labour prevalence estimate",unit:"per 1,000 population",direction:"lower_is_better",tag:"forced"},
  "workers.freedom_of_association":{id:"trade_union_density",name:"Trade union density",terms:"trade union density and collective bargaining coverage",benchmark:"ILO Conventions 87 and 98 ratification status",unit:"% of employees",direction:"higher_is_better",tag:"union"},
  "workers.equal_opportunities":{id:"gender_pay_gap",name:"Gender pay gap",terms:"gender pay gap median hourly earnings",benchmark:"national or OECD average gender pay gap",unit:"%",direction:"lower_is_better",tag:"gender"},
  "workers.job_security":{id:"unemployment_rate",name:"Unemployment rate",terms:"unemployment rate and redundancy or plant closure notices",benchmark:"national unemployment rate",unit:"%",direction:"lower_is_better",tag:"unemployment"},
  "local_communities.local_employment":{id:"local_unemployment_rate",name:"Regional unemployment rate",terms:"regional unemployment rate and sector employment",benchmark:"national unemployment rate",unit:"%",direction:"lower_is_better",tag:"unemployment"},
  "local_communities.safe_living_conditions":{id:"ambient_air_pollution",name:"Ambient air pollution exposure",terms:"annual mean PM2.5 concentration and road traffic deaths",benchmark:"WHO air quality guideline value",unit:"µg/m³",direction:"lower_is_better",tag:"air"},
  "local_communities.land_and_resource_rights":{id:"land_tenure_security",name:"Land tenure security",terms:"land tenure security, community consultation and land conflict",benchmark:"legal requirement for free prior and informed consent",unit:"index or qualitative",direction:null,tag:"land"},
  "local_communities.community_engagement":{id:"community_consultation_requirement",name:"Community consultation requirement",terms:"mandatory public consultation and grievance mechanism requirements for industrial facilities",benchmark:"legal requirement for consultation",unit:"qualitative",direction:null,tag:"rights"},
  "local_communities.cultural_heritage":{id:"protected_heritage",name:"Cultural heritage protection",terms:"cultural heritage protection law and protected sites",benchmark:"legal protection requirement",unit:"qualitative",direction:null,tag:"rights"},
  "value_chain_actors.fair_competition":{id:"market_concentration",name:"Market concentration",terms:"market concentration and competition law enforcement",benchmark:"competition authority concentration threshold",unit:"index",direction:"lower_is_better",tag:"economy"},
  "value_chain_actors.supplier_relationships":{id:"payment_terms",name:"Supplier payment terms",terms:"late payment law and typical supplier payment terms",benchmark:"statutory maximum payment period",unit:"days",direction:"lower_is_better",tag:"economy"},
  "value_chain_actors.responsible_sourcing":{id:"due_diligence_requirement",name:"Supply-chain due diligence requirement",terms:"mandatory human rights due diligence and supply chain law",benchmark:"OECD due diligence guidance",unit:"qualitative",direction:null,tag:"rights"},
  "value_chain_actors.technology_development":{id:"rd_expenditure",name:"R&D expenditure",terms:"research and development expenditure share of GDP",benchmark:"OECD average R&D expenditure",unit:"% of GDP",direction:"higher_is_better",tag:"economy"},
  "consumers.health_and_safety":{id:"product_safety_regulation",name:"Product safety regulation",terms:"consumer product safety regulation and recall notices",benchmark:"statutory product safety requirement",unit:"qualitative",direction:null,tag:"consumer"},
  "consumers.transparency":{id:"labelling_requirement",name:"Product labelling requirement",terms:"mandatory product labelling and consumer information law",benchmark:"statutory labelling requirement",unit:"qualitative",direction:null,tag:"consumer"},
  "consumers.privacy":{id:"data_protection_law",name:"Data protection law",terms:"data protection law and enforcement",benchmark:"GDPR-equivalent protection",unit:"qualitative",direction:null,tag:"rights"},
  "consumers.feedback_mechanisms":{id:"consumer_complaint_mechanism",name:"Consumer complaint mechanism",terms:"consumer complaint and redress mechanism requirements",benchmark:"statutory redress requirement",unit:"qualitative",direction:null,tag:"consumer"},
  "consumers.end_of_life_responsibility":{id:"recycling_rate",name:"Recycling rate",terms:"recycling rate municipal or packaging waste",benchmark:"national or regional recycling target",unit:"%",direction:"higher_is_better",tag:"environment"},
  "society.corruption":{id:"corruption_perception_score",name:"Corruption perception score",terms:"corruption perceptions index score",benchmark:"global average corruption perceptions score",unit:"score 0-100",direction:"higher_is_better",tag:"governance"},
  "society.economic_development":{id:"sector_employment_share",name:"Sector share of employment",terms:"share of national employment and value added in this sector",benchmark:"national economy-wide share",unit:"%",direction:"higher_is_better",tag:"economy"},
  "society.public_commitments":{id:"public_commitment",name:"Public sustainability commitments",terms:"sector sustainability commitments or national targets",benchmark:"national target",unit:"qualitative",direction:null,tag:"economy"},
  "society.regulatory_compliance":{id:"labour_inspection_coverage",name:"Labour inspection coverage",terms:"labour inspectors per 10,000 workers and enforcement",benchmark:"ILO recommended inspector ratio",unit:"inspectors per 10,000 workers",direction:"higher_is_better",tag:"labour"},
  "children.child_labour":{id:"child_labour_prevalence",name:"Child labour prevalence",terms:"child labour prevalence among children aged 5 to 17",benchmark:"global child labour prevalence estimate",unit:"% of children 5-17",direction:"lower_is_better",tag:"child"},
  "children.education":{id:"out_of_school_rate",name:"Out-of-school rate",terms:"out-of-school rate lower secondary age",benchmark:"global out-of-school rate",unit:"%",direction:"lower_is_better",tag:"education"},
  "children.health_and_safety_as_consumers":{id:"child_health_risk",name:"Child health exposure",terms:"child health indicator relevant to this product",benchmark:"WHO recommendation",unit:"%",direction:"lower_is_better",tag:"health"}
});
const FALLBACK_KEY="value_chain_actors.responsible_sourcing";

const LEVELS=Object.freeze([
  {id:"exact",label:"exact product and place",schema_level:"region",quality_cap:"A",proxy:false},
  {id:"sector_country",label:"sector in the country",schema_level:"country",quality_cap:"B",proxy:true},
  {id:"country",label:"country overall",schema_level:"country",quality_cap:"B",proxy:true},
  {id:"international",label:"international or regional figure",schema_level:"global",quality_cap:"C",proxy:true}
]);

// Indicators where sector- or product-level figures usually exist; others start at the country level.
const SECTOR_SPECIFIC=new Set(["occupational_fatal_injury_rate","minimum_wage_level","weekly_working_hours","trade_union_density","gender_pay_gap","forced_labour_prevalence","child_labour_prevalence","sector_employment_share","recycling_rate"]);
const levelsFor=question=>question.kind==="benchmark"?LEVELS.filter(item=>["country","international"].includes(item.id)):LEVELS.filter(item=>SECTOR_SPECIFIC.has(question.indicator_id)||["country","international"].includes(item.id));

// A figure is only as specific as the area it actually covers, whatever the query asked for.
const SCOPE_RANK={product:0,region:0,sector:1,country:2,global:3};
const effectiveLevel=(level,scope)=>LEVELS[Math.max(LEVELS.findIndex(item=>item.id===level.id),SCOPE_RANK[scope]??2)];

const slug=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const targetYear=timeframe=>{const match=String(timeframe||"").match(/\b(19|20)\d{2}\b/);return match?Number(match[0]):null;};

function placeOf(intake){
  const level=intake.locality||intake.region?"region":"country";
  const label=[intake.locality,intake.region,intake.country].filter((v,i,a)=>v&&a.indexOf(v)===i).join(", ");
  return {country:intake.country,country_code:intake.country_code,region:intake.region||intake.locality||null,label,level};
}

// Queries are English; the orchestrator translates them into the country's language when English finds nothing.
function queriesFor(question,level){
  const {indicator,place,product,sector,year}=question,when=year||"latest";
  if(level.id==="exact")return [`${indicator.terms} ${product} ${place.label} ${when}`,`${product} ${place.country} ${indicator.terms} official statistics`];
  if(level.id==="sector_country")return [`${indicator.terms} ${sector} ${place.country} ${when}`,`${sector} ${place.country} ${indicator.terms} statistics report`];
  if(level.id==="country")return [`${indicator.terms} ${place.country} official statistics ${when}`,`${indicator.terms} ${place.country} ministry OR national statistics office`];
  return [...starterHostsFor(indicator.tag,3).map(item=>`site:${item.host} ${indicator.terms} ${place.country}`),`${indicator.terms} ${place.country} international comparison ${when}`];
}

function benchmarkQueriesFor(question,level){
  const {indicator,place,year}=question,when=year||"latest";
  if(level.id==="international")return [`${indicator.benchmark} international ${when}`];
  return [`${indicator.benchmark} ${place.country} ${when}`,`${indicator.benchmark} ${place.country} official`];
}

// Stages x stakeholder topics collapse into distinct (indicator, place) questions; each remembers its stages.
// Every indicator question gets a twin benchmark question (kind "benchmark") so scores have a stated reference point.
function buildQuestions({intake,stages=[]},{maxQuestions=24}={}){
  const place=placeOf(intake),year=targetYear(intake.timeframe),product=intake.product,sector=intake.industry||product;
  const byKey=new Map();
  const ordered=[...stages].sort((a,b)=>Number(b.foreground)-Number(a.foreground));
  for(const stage of ordered)for(const topic of stage.social_risks||stage.screening_topics||[]){
    const identity=topicIdentity(topic),key=`${identity.stakeholder}.${identity.subcategory}`,indicator=INDICATORS[key]||INDICATORS[FALLBACK_KEY];
    const existing=byKey.get(indicator.id);
    if(existing){if(!existing.stage_ids.includes(stage.id))existing.stage_ids.push(stage.id);continue;}
    byKey.set(indicator.id,{indicator_id:indicator.id,indicator,stakeholder:identity.stakeholder,subcategory:identity.subcategory,stage_ids:[stage.id],topics:[topic],place,product,sector,year});
  }
  // Cover stakeholders no stage mentioned so the report is never silent on a whole pillar.
  for(const [key,indicator] of Object.entries(INDICATORS)){
    const [stakeholder,subcategory]=key.split(".");
    if([...byKey.values()].some(item=>item.stakeholder===stakeholder))continue;
    byKey.set(indicator.id,{indicator_id:indicator.id,indicator,stakeholder,subcategory,stage_ids:[],topics:[subcategory.replaceAll("_"," ")],place,product,sector,year});
  }
  const questions=[];
  for(const base of [...byKey.values()].slice(0,maxQuestions)){
    const text=`What is the ${base.indicator.terms} for ${place.label}${year?` in ${year}`:" (latest year)"}, and how does it compare with the ${base.indicator.benchmark}?`;
    questions.push({...base,kind:"indicator",id:`q-${slug(base.indicator_id)}`,text});
    questions.push({...base,kind:"benchmark",id:`q-${slug(base.indicator_id)}-benchmark`,text:`What is the ${base.indicator.benchmark} applicable to ${place.country}${year?` in ${year}`:""}?`});
  }
  return questions;
}

module.exports={FALLBACK_KEY,INDICATORS,LEVELS,benchmarkQueriesFor,buildQuestions,effectiveLevel,levelsFor,placeOf,queriesFor,targetYear};
