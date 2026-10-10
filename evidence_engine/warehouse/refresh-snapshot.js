"use strict";

const crypto=require("node:crypto");
const fs=require("node:fs");
const path=require("node:path");
const {MATERIAL_ORIGINS,PROFILES,SOURCES,versionId}=require("./profiles");

const OUT=path.join(__dirname,"snapshot.json");
const hash=value=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const round=(value,places=2)=>Math.round(Number(value)*10**places)/10**places;
const latest=(rows)=>Array.isArray(rows)?rows.find(row=>Number.isFinite(row?.value)):null;

const STATE_FIPS={Alabama:"01",Alaska:"02",Arizona:"04",Arkansas:"05",California:"06",Colorado:"08",Connecticut:"09",Delaware:"10","District of Columbia":"11",Florida:"12",Georgia:"13",Hawaii:"15",Idaho:"16",Illinois:"17",Indiana:"18",Iowa:"19",Kansas:"20",Kentucky:"21",Louisiana:"22",Maine:"23",Maryland:"24",Massachusetts:"25",Michigan:"26",Minnesota:"27",Mississippi:"28",Missouri:"29",Montana:"30",Nebraska:"31",Nevada:"32","New Hampshire":"33","New Jersey":"34","New Mexico":"35","New York":"36","North Carolina":"37","North Dakota":"38",Ohio:"39",Oklahoma:"40",Oregon:"41",Pennsylvania:"42","Rhode Island":"44","South Carolina":"45","South Dakota":"46",Tennessee:"47",Texas:"48",Utah:"49",Vermont:"50",Virginia:"51",Washington:"53","West Virginia":"54",Wisconsin:"55",Wyoming:"56"};
const ISO3_TO_NAME={USA:"United States",DEU:"Germany",IND:"India",BRA:"Brazil",CHN:"China",MEX:"Mexico",CAN:"Canada",JPN:"Japan",KOR:"South Korea",FRA:"France",ITA:"Italy",GBR:"United Kingdom",AUS:"Australia",CHL:"Chile",IDN:"Indonesia",MYS:"Malaysia",VNM:"Vietnam",THA:"Thailand",TWN:"Taiwan",SGP:"Singapore",BGD:"Bangladesh",PAK:"Pakistan",TUR:"Turkey",PER:"Peru",COL:"Colombia",ETH:"Ethiopia",GHA:"Ghana",COD:"DR Congo",ZAF:"South Africa",BWA:"Botswana",AGO:"Angola",BEL:"Belgium",CHE:"Switzerland",NLD:"Netherlands",ESP:"Spain",POL:"Poland",PHL:"Philippines",KHM:"Cambodia",ARG:"Argentina",IRL:"Ireland",GIN:"Guinea",RUS:"Russian Federation",MDG:"Madagascar",MOZ:"Mozambique",MMR:"Myanmar",RWA:"Rwanda",NGA:"Nigeria",ZWE:"Zimbabwe",CIV:"Cote d'Ivoire",SLE:"Sierra Leone",MLI:"Mali",BFA:"Burkina Faso"};

async function fetchText(url,options={}){
  const response=await fetch(url,{...options,headers:{"user-agent":"SYCLE warehouse refresh/1.0",...(options.headers||{})}});
  if(!response.ok)throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

async function fetchWorldBank(indicator){
  const url=`https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&date=2020:2026`;
  const raw=await fetchText(url);const payload=JSON.parse(raw);const wanted=new Set(Object.keys(ISO3_TO_NAME));const byCountry=new Map();
  for(const row of payload?.[1]||[]){if(!wanted.has(row.countryiso3code)||!Number.isFinite(row.value))continue;const prior=byCountry.get(row.countryiso3code);if(!prior||Number(row.date)>Number(prior.date))byCountry.set(row.countryiso3code,row);}
  return {url,raw,rows:[...byCountry.values()]};
}

async function fetchStateUnemployment(){
  const entries=Object.entries(STATE_FIPS),rawParts=[],rows=[];
  for(let start=0;start<entries.length;start+=25){
    const batch=entries.slice(start,start+25);const seriesid=batch.map(([,fips])=>`LASST${fips}0000000000003`);
    const raw=await fetchText("https://api.bls.gov/publicAPI/v2/timeseries/data/",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({seriesid,startyear:"2025",endyear:"2026"})});
    rawParts.push(raw);const payload=JSON.parse(raw);
    for(const series of payload?.Results?.series||[]){const hit=batch.find(([,fips])=>series.seriesID===`LASST${fips}0000000000003`);const observation=(series.data||[]).find(item=>Number.isFinite(Number(item.value))&&item.period!=="M13");if(hit&&observation)rows.push({state:hit[0],fips:hit[1],value:Number(observation.value),edition:`${observation.periodName} ${observation.year}${observation.latest==="true"?" preliminary":""}`});}
  }
  return {raw:rawParts.join("\n"),rows};
}

async function fetchStateUnion(){
  const raw=await fetchText("https://www.bls.gov/news.release/union2.t05.htm");const rows=[];
  for(const [state] of Object.entries(STATE_FIPS)){
    const candidate=(raw.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi)||[]).find(row=>row.replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim().startsWith(`${state} `));
    if(!candidate)continue;const values=[...candidate.matchAll(/class="datavalue">\s*([^<]+)/gi)].map(match=>Number(match[1].replace(/,/g,"")));if(values.length>=10&&Number.isFinite(values[7]))rows.push({state,value:values[7],edition:"2025 annual averages"});
  }
  return {raw,rows};
}

function record({indicator_id,indicator_name,geography_key,geography_name,geography_level,country_code=null,value=null,value_text=null,unit,confidence,interpretation,source_version_id,dimensions={}}){
  const token=hash({indicator_id,geography_key,country_code,value,value_text,source_version_id,dimensions}).slice(0,16);
  return {id:`ev-${indicator_id}-${token}`,indicator_id,indicator_name,geography_key,geography_name,geography_level,country_code,sector_key:null,product_key:null,value,value_text,unit,confidence,interpretation,source_version_id,dimensions};
}

async function main(){
  const retrievedAt=new Date().toISOString();const rawBySource=new Map();const records=[];
  const indicators=[
    ["SL.UEM.TOTL.ZS","unemployment_rate","Unemployment rate","percent","Labour-market context; not a facility employment outcome."],
    ["SL.EMP.VULN.ZS","vulnerable_employment","Vulnerable employment","percent of total employment","Country labour-structure proxy; not a facility employment condition."],
    ["SL.TLF.CACT.FE.ZS","female_labor_participation","Female labour-force participation","percent of female population ages 15+","Country gender-participation context; not a facility diversity outcome."],
    ["SL.TLF.CACT.MA.ZS","male_labor_participation","Male labour-force participation","percent of male population ages 15+","Country gender-participation context; not a facility diversity outcome."],
    ["GOV_WGI_CC_EST","control_of_corruption","Control of corruption estimate","estimate (-2.5 to +2.5)","Country governance proxy; not an operator assessment."]
  ];
  for(const [apiId,id,name,unit,interpretation] of indicators){const result=await fetchWorldBank(apiId);rawBySource.set(apiId.startsWith("GOV_")?"worldbank-wgi":"worldbank-wdi",(rawBySource.get(apiId.startsWith("GOV_")?"worldbank-wgi":"worldbank-wdi")||"")+result.raw);for(const row of result.rows){records.push(record({indicator_id:id,indicator_name:name,geography_key:row.countryiso3code,geography_name:ISO3_TO_NAME[row.countryiso3code],geography_level:"country",country_code:row.countryiso3code,value:round(row.value,3),unit,confidence:"H",interpretation,source_version_id:versionId(apiId.startsWith("GOV_")?"worldbank-wgi":"worldbank-wdi"),dimensions:{edition:String(row.date),api_indicator:apiId}}));}}
  try{const result=await fetchStateUnemployment();rawBySource.set("bls-laus",result.raw);for(const row of result.rows)records.push(record({indicator_id:"unemployment_rate",indicator_name:"Unemployment rate",geography_key:`US-${row.fips}`,geography_name:row.state,geography_level:"state",country_code:"USA",value:row.value,unit:"percent",confidence:"H",interpretation:"State labour-market context; not a facility employment outcome.",source_version_id:versionId("bls-laus"),dimensions:{edition:row.edition}}));}catch(error){console.warn(`BLS LAUS refresh skipped: ${error.message}`);}
  try{const result=await fetchStateUnion();rawBySource.set("bls-union",result.raw);for(const row of result.rows){const fips=STATE_FIPS[row.state];records.push(record({indicator_id:"union_membership_rate",indicator_name:"Union membership rate",geography_key:`US-${fips}`,geography_name:row.state,geography_level:"state",country_code:"USA",value:row.value,unit:"percent",confidence:"H",interpretation:"State workforce proxy; not a facility unionisation rate.",source_version_id:versionId("bls-union"),dimensions:{edition:row.edition}}));}}catch(error){console.warn(`BLS union refresh skipped: ${error.message}`);}

  const dolFlags=[
    ["cobalt","COD","DR Congo","Child labour"],["diamonds","AGO","Angola","Forced labour and child labour"],["diamonds","COD","DR Congo","Forced labour and child labour"],["diamonds","SLE","Sierra Leone","Child labour"],
    ["gold","COD","DR Congo","Forced labour and child labour"],["gold","GHA","Ghana","Child labour"],["gold","MLI","Mali","Child labour"],["gold","BFA","Burkina Faso","Child labour"],
    ["cotton","CHN","China","Forced labour"],["cotton","IND","India","Child labour"],["cotton","PAK","Pakistan","Child labour"],
    ["coffee","BRA","Brazil","Child labour"],["coffee","COL","Colombia","Child labour"],["coffee","ETH","Ethiopia","Child labour"],
    ["polysilicon","CHN","China","Forced labour"]
  ];
  for(const [material,countryCode,countryName,issue] of dolFlags)records.push(record({indicator_id:"child_forced_labour_goods_flag",indicator_name:"DOL child/forced-labour goods signal",geography_key:countryCode,geography_name:countryName,geography_level:"country",country_code:countryCode,value:1,value_text:`${material}: ${issue}`,unit:"boolean",confidence:"H",interpretation:"Product-country listing signal; actual supplier linkage must be verified.",source_version_id:versionId("us-dol-goods"),dimensions:{material,issue}}));

  const sourceVersions=SOURCES.map(source=>({id:versionId(source.id),source_id:source.id,edition:source.edition,retrieved_at:retrievedAt,checksum:hash(rawBySource.get(source.id)||source)}));
  const material_origins=MATERIAL_ORIGINS.flatMap(item=>item.countries.map(([country_code,country_name])=>({id:`origin-${item.material_key}-${country_code}`,material_key:item.material_key,material_name:item.material_name,country_code,country_name,basis:item.basis,social_topics:item.social_topics,confidence:item.confidence,source_version_id:item.source_version_id})));
  const profiles=PROFILES.map(({sources,index,...profile})=>({id:profile.id,sector_key:profile.sector_key,variant:profile.variant,version:profile.version,product_patterns:profile.product_patterns,naics_codes:profile.naics_codes,hs_codes:profile.hs_codes,profile:{stages:profile.stages},source_ids:profile.source_ids,checksum:hash(profile)}));
  const body={schema_version:1,generated_at:retrievedAt,sources:SOURCES.map(({edition,...source})=>source),source_versions:sourceVersions,records,material_origins,profiles};body.checksum=hash(body);body.id=`warehouse-${retrievedAt.slice(0,10)}-${body.checksum.slice(0,10)}`;
  fs.writeFileSync(OUT,JSON.stringify(body,null,2)+"\n","utf8");console.log(JSON.stringify({file:OUT,id:body.id,checksum:body.checksum,records:records.length,origins:material_origins.length,profiles:profiles.length},null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
