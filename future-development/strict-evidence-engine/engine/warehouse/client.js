"use strict";

const crypto=require("node:crypto");

const stableId=(prefix,value)=>`${prefix}-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0,24)}`;

function createWarehouseClient(options={}){
  const env=options.env||process.env;
  const base=(env.SYCLE_SUPABASE_URL||env.SUPABASE_URL||"").replace(/\/$/,"");
  const key=env.SYCLE_SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  const fetchImpl=options.fetchImpl||fetch;
  if(!base||!key)return null;
  const headers={apikey:key,authorization:`Bearer ${key}`};

  async function request(pathname,{method="GET",body,prefer}={}){
    const response=await fetchImpl(`${base}/rest/v1/${pathname}`,{method,headers:{...headers,"content-type":"application/json",...(prefer?{prefer}: {})},body:body===undefined?undefined:JSON.stringify(body)});
    const text=await response.text();if(!response.ok)throw new Error(`${method} ${pathname} failed ${response.status}: ${text.slice(0,500)}`);return text?JSON.parse(text):null;
  }
  async function upsert(table,rows){if(!rows?.length)return;return request(`${table}?on_conflict=id`,{method:"POST",body:rows,prefer:"resolution=merge-duplicates,return=minimal"});}
  async function upload(path,bytes,contentType="application/octet-stream"){
    const response=await fetchImpl(`${base}/storage/v1/object/sycle-evidence-raw/${path}`,{method:"POST",headers:{...headers,"content-type":contentType,"x-upsert":"true"},body:bytes});
    const text=await response.text();if(!response.ok)throw new Error(`Storage upload failed ${response.status}: ${text.slice(0,300)}`);return path;
  }
  async function catalogueSummary(product,geography){
    const [sources,datasets,claims]=await Promise.all([
      request("sycle_evidence_sources?select=id,name,publisher,source_type,update_cadence&limit=100"),
      request("sycle_dataset_library?select=id,title,publisher,source_type,licence_status,status,scope&status=eq.active&limit=100"),
      request("rpc/sycle_claim_library_search",{method:"POST",body:{p_product_key:product||"",p_geography:geography||"",p_limit:100}})
    ]);
    return {existing_sources:sources||[],ingested_datasets:datasets||[],reusable_claims:claims||[]};
  }
  async function findLifecycle(product){const productKey=String(product||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();if(!productKey)return null;const rows=await request(`sycle_lifecycle_profiles?select=id,product_key,version,research_plan,evidence_checksum&product_key=eq.${encodeURIComponent(productKey)}&status=eq.active&order=version.desc&limit=1`);return rows?.[0]||null;}
  return {base,key,fetchImpl,request,upsert,upload,catalogueSummary,findLifecycle,stableId};
}

module.exports={createWarehouseClient,stableId};
