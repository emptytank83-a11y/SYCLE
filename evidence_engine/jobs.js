"use strict";

const crypto=require("node:crypto");
const {generate}=require("./production");
const {createWarehouseClient}=require("./warehouse/client");

const ACTIVE=new Set(["resolving_product","searching_library","discovering_sources","retrieving_evidence","validating","building_report"]);
const hash=value=>crypto.createHash("sha256").update(String(value)).digest("hex");
const safeId=value=>/^[0-9a-f-]{36}$/i.test(String(value||""))?String(value):null;

function secureEqual(left,right){
  const a=Buffer.from(String(left||"")),b=Buffer.from(String(right||""));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function publicJob(job){
  if(!job)return null;
  return {id:job.id,status:job.status,progress:job.progress,public_message:job.public_message,result:job.result_payload||null,error_code:job.error_code||null,created_at:job.created_at,updated_at:job.updated_at,completed_at:job.completed_at||null};
}

async function createEvidenceJob(payload,options={}){
  const client=options.client||createWarehouseClient(options);if(!client)throw new Error("Evidence warehouse is unavailable");
  const accessToken=crypto.randomBytes(32).toString("base64url"),productKey=String(payload?.spec?.product||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()||null;
  const rows=await client.request("sycle_evidence_jobs",{method:"POST",body:{user_id:options.userId||null,status:"queued",progress:2,public_message:"Evidence job queued",product_key:productKey,request_payload:payload,access_token_hash:hash(accessToken)},prefer:"return=representation"});
  return {...publicJob(rows?.[0]),access_token:accessToken};
}

async function getEvidenceJob(id,accessToken,options={}){
  const jobId=safeId(id);if(!jobId)return null;const client=options.client||createWarehouseClient(options);if(!client)return null;
  const rows=await client.request(`sycle_evidence_jobs?select=*&id=eq.${jobId}&limit=1`),job=rows?.[0];
  if(!job||!secureEqual(job.access_token_hash,hash(accessToken)))return null;
  return {client,job};
}

async function patchJob(client,id,body){
  const rows=await client.request(`sycle_evidence_jobs?id=eq.${id}`,{method:"PATCH",body:{...body,updated_at:new Date().toISOString()},prefer:"return=representation"});return rows?.[0]||null;
}

async function runEvidenceJob(id,accessToken,options={}){
  const loaded=await getEvidenceJob(id,accessToken,options);if(!loaded)return {status:"not_found"};const {client}=loaded;let {job}=loaded;
  if(job.status==="complete"||job.status==="failed")return publicJob(job);
  if(ACTIVE.has(job.status)&&job.locked_at&&Date.now()-Date.parse(job.locked_at)<10*60*1000)return publicJob(job);
  job=await patchJob(client,job.id,{status:"resolving_product",progress:8,public_message:"Resolving the exact product and facility geography",locked_at:new Date().toISOString(),attempts:Number(job.attempts||0)+1,error_code:null});
  const onProgress=async update=>{job=await patchJob(client,job.id,{status:update.status,progress:update.progress,public_message:update.message});};
  try{
    const result=await generate({...job.request_payload,user_id:job.user_id||null},{...options,warehouseClient:client,requireSupabase:true,requireDynamicResearch:false,onProgress});
    if(result.status==="complete"||result.status==="needs_clarification"){
      job=await patchJob(client,job.id,{status:"complete",progress:100,public_message:result.status==="complete"?"Report generated and validated":"Additional project details are required",result_payload:result,completed_at:new Date().toISOString(),locked_at:null});
    }else{
      job=await patchJob(client,job.id,{status:"failed",progress:100,public_message:"SYCLE could not verify enough matching evidence to release this report. No unrelated product data was substituted.",result_payload:result,error_code:result.code||"evidence_validation_failed",completed_at:new Date().toISOString(),locked_at:null});
    }
  }catch(error){
    console.error("evidence-job failure",{job_id:job.id,code:error.code||"unhandled",message:error.message,stack:error.stack});
    job=await patchJob(client,job.id,{status:"failed",progress:100,public_message:"The evidence job could not complete. Retry the report; no unsupported data was saved.",error_code:error.code||"evidence_job_failed",completed_at:new Date().toISOString(),locked_at:null});
  }
  return publicJob(job);
}

module.exports={createEvidenceJob,getEvidenceJob,publicJob,runEvidenceJob};
