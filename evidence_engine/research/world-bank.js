"use strict";

const crypto=require("node:crypto");
const isoCountries=require("i18n-iso-countries");
const en=require("i18n-iso-countries/langs/en.json");
const {stableId}=require("../warehouse/client");

isoCountries.registerLocale(en);

const ALIASES=Object.freeze({
  usa:"United States",us:"United States",america:"United States",uk:"United Kingdom",britain:"United Kingdom","great britain":"United Kingdom",
  uae:"United Arab Emirates",drc:"Democratic Republic of the Congo","dr congo":"Democratic Republic of the Congo",
  russia:"Russian Federation","south korea":"Korea, Republic of","north korea":"Korea, Democratic People's Republic of",
  vietnam:"Viet Nam",laos:"Lao People's Democratic Republic",bolivia:"Bolivia, Plurinational State of",
  tanzania:"Tanzania, United Republic of",venezuela:"Venezuela, Bolivarian Republic of",iran:"Iran, Islamic Republic of",
  syria:"Syrian Arab Republic",moldova:"Moldova, Republic of","ivory coast":"Cote d'Ivoire","cote d'ivoire":"Cote d'Ivoire",
  turkey:"Turkiye",turkiye:"Turkiye",czechia:"Czechia"
});
const CANONICAL=Object.freeze({USA:"United States",GBR:"United Kingdom",COD:"DR Congo",CIV:"Cote d'Ivoire",KOR:"South Korea",PRK:"North Korea",RUS:"Russia",TUR:"Turkiye",VNM:"Vietnam",LAO:"Laos"});

const INDICATORS=Object.freeze([
  {indicator_id:"unemployment_rate",code:"SL.UEM.TOTL.ZS",name:"Unemployment, total",unit:"percent of total labour force",interpretation:"Country labour-market context; not a facility employment outcome."},
  {indicator_id:"vulnerable_employment",code:"SL.EMP.VULN.ZS",name:"Vulnerable employment",unit:"percent of total employment",interpretation:"Country labour-structure context; not a facility employment condition."},
  {indicator_id:"female_labor_participation",code:"SL.TLF.CACT.FE.ZS",name:"Female labour-force participation",unit:"percent of female population ages 15+",interpretation:"Country gender-participation context; not a facility diversity outcome."},
  {indicator_id:"male_labor_participation",code:"SL.TLF.CACT.MA.ZS",name:"Male labour-force participation",unit:"percent of male population ages 15+",interpretation:"Country gender-participation context; not a facility diversity outcome."},
  {indicator_id:"control_of_corruption",code:"CC.EST",name:"Control of corruption estimate",unit:"estimate (-2.5 to +2.5)",interpretation:"Country governance context; not an operator assessment."}
]);

const hash=value=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const normal=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

let catalogueCache=null;
function countryCatalogue(){
  if(catalogueCache)return catalogueCache;
  const official=isoCountries.getNames("en",{select:"official"}),aliases=isoCountries.getNames("en",{select:"alias"});
  const entries=[];for(const alpha2 of new Set([...Object.keys(official),...Object.keys(aliases)]))for(const name of new Set([official[alpha2],aliases[alpha2]].filter(Boolean)))entries.push({alpha2,alpha3:isoCountries.alpha2ToAlpha3(alpha2),name});
  catalogueCache=entries.filter(item=>item.alpha3);return catalogueCache;
}

function matchCountry(value){
  const raw=String(value||"").trim();if(!raw)return null;
  const aliased=ALIASES[normal(raw)]||raw;const alpha3=isoCountries.getAlpha3Code(aliased,"en");
  if(alpha3)return {country:CANONICAL[alpha3]||isoCountries.getName(alpha3,"en",{select:"alias"})||aliased,countryCode:alpha3};
  const haystack=` ${normal(raw)} `;const aliasCandidates=Object.entries(ALIASES).map(([name,target])=>({name,alpha3:isoCountries.getAlpha3Code(target,"en")})).filter(item=>item.alpha3);const candidates=[...countryCatalogue(),...aliasCandidates].filter(item=>item.name).sort((a,b)=>normal(b.name).length-normal(a.name).length);
  const found=candidates.find(item=>haystack.includes(` ${normal(item.name)} `));return found?{country:CANONICAL[found.alpha3]||isoCountries.getName(found.alpha3,"en",{select:"alias"})||found.name,countryCode:found.alpha3}:null;
}

function statedLocation(prompt){
  const matches=[...String(prompt||"").matchAll(/\b(?:located\s+in|based\s+in|near|at|in)\s+([^.;!?]+)/gi)];if(!matches.length)return null;
  return matches.at(-1)[1].replace(/\s+\b(?:producing|manufacturing|processing|with\s+(?:an?\s+)?(?:annual\s+)?capacity|at\s+(?:an?\s+)?(?:annual\s+)?capacity)\b.*$/i,"").trim();
}

function resolveGeography(spec){
  const answeredLocation=String(spec.answers?.facility_location||"").trim();const resolved=matchCountry(answeredLocation)||matchCountry(spec.country)||matchCountry(spec.rawLocationText)||matchCountry(spec.prompt);if(!resolved)return spec;
  const rawLocation=answeredLocation||statedLocation(spec.rawLocationText||spec.prompt);let region=String(spec.region||"").trim();
  if(!region&&rawLocation){const countryNames=[resolved.country,...Object.entries(ALIASES).filter(([,target])=>isoCountries.getAlpha3Code(target,"en")===resolved.countryCode).map(([alias])=>alias)];let candidate=rawLocation;for(const name of countryNames)candidate=candidate.replace(new RegExp(`(?:,\\s*)?\\b${escapeRegex(name)}\\b`,`ig`),"");region=candidate.replace(/^[,\s]+|[,\s]+$/g,"").trim();}
  return {...spec,country:resolved.country,countryCode:resolved.countryCode,region,locationLabel:region?`${region}, ${resolved.country}`:resolved.country};
}

async function fetchJson(url,fetchImpl){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetchImpl(url,{signal:controller.signal,headers:{"user-agent":"SYCLE Evidence Warehouse/1.0"}});if(!response.ok)throw new Error(`World Bank API ${response.status}`);return await response.json();}finally{clearTimeout(timer);}
}

async function persist(client,countryCode,reference,measurements,raw){
  if(!client||!measurements.length)return;
  const datasetId="dataset-world-bank-indicators-api",versionId=reference.dataset_version_id,rawPath=`datasets/${datasetId}/${reference.checksum}/${countryCode}.json`;
  await client.upload(rawPath,Buffer.from(JSON.stringify(raw)),"application/json");
  await client.upsert("sycle_dataset_library",[{id:datasetId,title:"World Development Indicators and Worldwide Governance Indicators",publisher:"World Bank",source_url:"https://api.worldbank.org/v2/",dataset_url:"https://api.worldbank.org/v2/",source_type:"official_dataset",licence_name:"CC BY 4.0",licence_url:"https://datacatalog.worldbank.org/public-licenses",licence_status:"permitted_with_attribution",authority_score:100,scope:{geography:"global",indicators:INDICATORS.map(item=>item.code)},status:"active",last_checked_at:reference.retrieved_at,metadata:{api_version:"v2"}}]);
  await client.upsert("sycle_dataset_versions",[{id:versionId,dataset_id:datasetId,publication_year:Number(reference.edition)||null,retrieved_at:reference.retrieved_at,content_checksum:reference.checksum,raw_storage_path:rawPath,content_type:"application/json",byte_size:Buffer.byteLength(JSON.stringify(raw)),record_count:measurements.length,retrieval_status:"verified",retrieval_http_status:200,metadata:{country_code:countryCode,indicator_codes:INDICATORS.map(item=>item.code)}}]);
  await client.upsert("sycle_evidence_measurements",measurements.map(({source,retrieval_verified,...item})=>({...item,dataset_version_id:versionId})));
}

async function loadPersistedContext(client,spec){
  if(!client)return null;const rows=await client.request(`sycle_evidence_measurements?select=*&geography=eq.${encodeURIComponent(spec.country)}&order=observation_year.desc&limit=100`);if(!rows?.length)return null;
  const wanted=new Set(INDICATORS.map(item=>item.indicator_id)),selected=new Map();for(const row of rows)if(wanted.has(row.indicator_id)&&!selected.has(row.indicator_id))selected.set(row.indicator_id,row);const measurements=[...selected.values()];if(!measurements.length)return null;
  const versionIds=[...new Set(measurements.map(item=>item.dataset_version_id))],versions=await client.request(`sycle_dataset_versions?select=*&id=in.(${versionIds.join(",")})`),version=versions?.[0];if(!version)return null;
  const datasets=await client.request(`sycle_dataset_library?select=*&id=eq.${encodeURIComponent(version.dataset_id)}&limit=1`),dataset=datasets?.[0];if(!dataset)return null;
  const reference={id:version.id,dataset_id:dataset.id,dataset_version_id:version.id,name:dataset.title,publisher:dataset.publisher,url:dataset.source_url,dataset_url:dataset.dataset_url,edition:version.publication_year?String(version.publication_year):"undated",retrieved_at:version.retrieved_at,checksum:version.content_checksum,licence_status:dataset.licence_status,authority_score:dataset.authority_score,retrieval_status:version.retrieval_status,source_type:dataset.source_type};
  return {measurements:measurements.map(item=>({...item,retrieval_verified:version.retrieval_status==="verified",source:reference})),references:[reference],datasets:[dataset],from_cache:true};
}

async function fetchWorldBankContext(spec,{fetchImpl=fetch,client=null}={}){
  if(!spec.countryCode)return {measurements:[],references:[],datasets:[]};
  const raw=[],measurements=[];
  for(const definition of INDICATORS){
    const url=`https://api.worldbank.org/v2/country/${encodeURIComponent(spec.countryCode)}/indicator/${definition.code}?format=json&mrnev=1&per_page=5`;
    try{const payload=await fetchJson(url,fetchImpl);raw.push({url,payload});const row=Array.isArray(payload?.[1])?payload[1].find(item=>item.value!==null&&item.value!==undefined):null;if(!row)continue;
      measurements.push({id:stableId("measurement",`${definition.code}:${spec.countryCode}:${row.date}:${row.value}`),indicator_id:definition.indicator_id,indicator_name:row.indicator?.value||definition.name,value:Number(row.value),value_text:null,unit:definition.unit,geography:row.country?.value||spec.country,geography_level:"country",observation_year:Number(row.date)||null,evidence_quote:`${row.country?.value||spec.country}; ${row.indicator?.value||definition.name}; ${row.date}; ${row.value} ${definition.unit}`,locator:`World Bank API row ${definition.code}/${spec.countryCode}/${row.date}`,interpretation:definition.interpretation,confidence:"H",quote_verified:true,retrieval_verified:true});
    }catch(error){raw.push({url,error:error.message});}
  }
  if(!measurements.length)return await loadPersistedContext(client,spec)||{measurements:[],references:[],datasets:[]};
  const retrievedAt=new Date().toISOString(),contentChecksum=hash(raw),edition=String(Math.max(...measurements.map(item=>item.observation_year||0))),datasetVersionId=stableId("dataset-version",`world-bank:${spec.countryCode}:${contentChecksum}`);
  const reference={id:datasetVersionId,dataset_id:"dataset-world-bank-indicators-api",dataset_version_id:datasetVersionId,name:"World Development Indicators and Worldwide Governance Indicators",publisher:"World Bank",url:"https://api.worldbank.org/v2/",dataset_url:"https://api.worldbank.org/v2/",edition,retrieved_at:retrievedAt,checksum:contentChecksum,licence_status:"permitted_with_attribution",authority_score:100,retrieval_status:"verified",source_type:"official_dataset"};
  for(const item of measurements)item.source=reference;
  await persist(client,spec.countryCode,reference,measurements,raw);
  return {measurements,references:[reference],datasets:[{id:"dataset-world-bank-indicators-api",title:reference.name,publisher:reference.publisher,status:"active",licence_status:reference.licence_status,source_url:reference.url}]};
}

module.exports={fetchWorldBankContext,loadPersistedContext,matchCountry,resolveGeography};
