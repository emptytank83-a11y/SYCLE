"use strict";

const snapshot=require("./snapshot.json");

const STATE_FIPS=Object.freeze({Alabama:"01",Alaska:"02",Arizona:"04",Arkansas:"05",California:"06",Colorado:"08",Connecticut:"09",Delaware:"10","District of Columbia":"11",Florida:"12",Georgia:"13",Hawaii:"15",Idaho:"16",Illinois:"17",Indiana:"18",Iowa:"19",Kansas:"20",Kentucky:"21",Louisiana:"22",Maine:"23",Maryland:"24",Massachusetts:"25",Michigan:"26",Minnesota:"27",Mississippi:"28",Missouri:"29",Montana:"30",Nebraska:"31",Nevada:"32","New Hampshire":"33","New Jersey":"34","New Mexico":"35","New York":"36","North Carolina":"37","North Dakota":"38",Ohio:"39",Oklahoma:"40",Oregon:"41",Pennsylvania:"42","Rhode Island":"44","South Carolina":"45","South Dakota":"46",Tennessee:"47",Texas:"48",Utah:"49",Vermont:"50",Virginia:"51",Washington:"53","West Virginia":"54",Wisconsin:"55",Wyoming:"56"});

function regionKey(spec){
  if(spec.countryCode!=="USA"||!spec.region)return null;
  const state=String(spec.region).replace(/\s+City$/i,"");const hit=Object.entries(STATE_FIPS).find(([name])=>name.toLowerCase()===state.toLowerCase());
  return hit?`US-${hit[1]}`:null;
}

function requestedVariant(spec){
  if(spec.sectorKey==="automotive")return spec.answers?.vehicle_variant||"ice";
  return "default";
}

function embeddedBundle(spec){
  const variant=requestedVariant(spec);const profile=snapshot.profiles.find(item=>item.sector_key===spec.sectorKey&&item.variant===variant)||snapshot.profiles.find(item=>item.sector_key===spec.sectorKey&&item.variant==="default");
  if(!profile)return null;
  const keys=[regionKey(spec),spec.countryCode,"GLOBAL"].filter(Boolean);const materialKeys=new Set(profile.profile.stages.flatMap(stage=>stage.materials||[]));
  const material_origins=snapshot.material_origins.filter(item=>materialKeys.has(item.material_key));const originCodes=new Set(material_origins.map(item=>item.country_code));
  const records=snapshot.records.filter(item=>keys.includes(item.geography_key)&&(item.sector_key==null||item.sector_key===spec.sectorKey));
  const origin_country_records=snapshot.records.filter(item=>originCodes.has(item.country_code)&&["control_of_corruption","vulnerable_employment","child_forced_labour_goods_flag"].includes(item.indicator_id));
  const versionIds=new Set([...records.map(item=>item.source_version_id),...material_origins.map(item=>item.source_version_id),...profile.source_ids]);
  const source_versions=snapshot.source_versions.filter(item=>versionIds.has(item.id));const sourceIds=new Set(source_versions.map(item=>item.source_id));
  return {snapshot:{id:snapshot.id,generated_at:snapshot.generated_at,checksum:snapshot.checksum,status:"active",record_count:snapshot.records.length},profile,records,material_origins,origin_country_records,source_versions,sources:snapshot.sources.filter(item=>sourceIds.has(item.id)),warehouse_mode:"embedded_snapshot"};
}

async function supabaseBundle(spec,{fetchImpl=fetch,env=process.env}={}){
  const base=env.SYCLE_SUPABASE_URL||env.SUPABASE_URL;const key=env.SYCLE_SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!base||!key)return null;
  const geographyKeys=[regionKey(spec),spec.countryCode,"GLOBAL"].filter(Boolean);
  const response=await fetchImpl(`${base.replace(/\/$/,"")}/rest/v1/rpc/sycle_get_evidence_bundle`,{method:"POST",headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json"},body:JSON.stringify({p_country_code:spec.countryCode,p_geography_keys:geographyKeys,p_sector_key:spec.sectorKey,p_variant:requestedVariant(spec)})});
  if(!response.ok)throw new Error(`Supabase evidence warehouse ${response.status}: ${await response.text()}`);
  const bundle=await response.json();if(!bundle?.snapshot||!bundle?.profile)return null;return {...bundle,warehouse_mode:"supabase"};
}

async function loadEvidenceBundle(spec,options={}){
  try{const remote=await supabaseBundle(spec,options);if(remote)return remote;}catch(error){if(options.requireSupabase)throw error;const fallback=embeddedBundle(spec);if(fallback)fallback.warehouse_warning=`Supabase unavailable; used identical bundled snapshot ${fallback.snapshot.id}. ${error.message}`;return fallback;}
  return embeddedBundle(spec);
}

module.exports={STATE_FIPS,embeddedBundle,loadEvidenceBundle,regionKey,requestedVariant,supabaseBundle};
