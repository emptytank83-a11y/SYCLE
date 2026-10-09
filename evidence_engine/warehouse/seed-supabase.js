"use strict";

const fs=require("node:fs");
const path=require("node:path");
const snapshot=require("./snapshot.json");

const projectRef=process.env.SYCLE_SUPABASE_PROJECT_REF||"augrmrnvdsgilmpjrzpw";
const base=process.env.SYCLE_SUPABASE_URL||`https://${projectRef}.supabase.co`;

function loadKey(){
  if(process.env.SYCLE_SUPABASE_SERVICE_ROLE_KEY)return process.env.SYCLE_SUPABASE_SERVICE_ROLE_KEY;
  const file=path.join(__dirname,"..","..","work","sycle-supabase-keys.json");if(!fs.existsSync(file))throw new Error("Set SYCLE_SUPABASE_SERVICE_ROLE_KEY or create work/sycle-supabase-keys.json");
  const keys=JSON.parse(fs.readFileSync(file,"utf8"));const selected=keys.find(item=>item.name==="service_role")||keys.find(item=>item.type==="secret");const key=selected?.api_key||selected?.key;if(!key)throw new Error("Supabase service key not found");return key;
}

const key=loadKey();
async function request(pathname,{method="GET",body,prefer}={}){
  const response=await fetch(`${base}/rest/v1/${pathname}`,{method,headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json",...(prefer?{prefer}: {})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();if(!response.ok)throw new Error(`${method} ${pathname} failed ${response.status}: ${text}`);return text?JSON.parse(text):null;
}

async function upsert(table,rows){
  const size=100;for(let start=0;start<rows.length;start+=size)await request(`${table}?on_conflict=id`,{method:"POST",body:rows.slice(start,start+size),prefer:"resolution=merge-duplicates,return=minimal"});
}

async function main(){
  await request("sycle_evidence_snapshots?status=eq.active",{method:"PATCH",body:{status:"superseded"},prefer:"return=minimal"});
  await upsert("sycle_evidence_snapshots",[{id:snapshot.id,generated_at:snapshot.generated_at,checksum:snapshot.checksum,status:"active",record_count:snapshot.records.length,notes:"Official-source warehouse refresh; report generation reads this snapshot without calling public APIs."}]);
  await upsert("sycle_evidence_sources",snapshot.sources);
  await upsert("sycle_evidence_source_versions",snapshot.source_versions.map(item=>({...item,snapshot_id:snapshot.id})));
  await upsert("sycle_evidence_records",snapshot.records.map(item=>({...item,snapshot_id:snapshot.id})));
  await upsert("sycle_material_origins",snapshot.material_origins.map(item=>({...item,snapshot_id:snapshot.id})));
  await upsert("sycle_industry_profiles",snapshot.profiles.map(item=>({...item,snapshot_id:snapshot.id})));
  const bundle=await request("rpc/sycle_get_evidence_bundle",{method:"POST",body:{p_country_code:"USA",p_geography_keys:["US-36","USA","GLOBAL"],p_sector_key:"automotive",p_variant:"ice"}});
  if(bundle?.snapshot?.id!==snapshot.id||!bundle?.profile||bundle.records.length<5||bundle.material_origins.length<5)throw new Error("Warehouse verification bundle is incomplete");
  console.log(JSON.stringify({project:projectRef,snapshot:snapshot.id,records:snapshot.records.length,origins:snapshot.material_origins.length,profiles:snapshot.profiles.length,verified_bundle:{records:bundle.records.length,origins:bundle.material_origins.length,profile:bundle.profile.id}},null,2));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
