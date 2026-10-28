"use strict";

const crypto=require("node:crypto");
const {authority,licenceStatus}=require("../research/source-policy");
const {stableId}=require("./client");

const checksum=value=>crypto.createHash("sha256").update(value).digest("hex");
const slug=value=>String(value||"source").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)||"source";
const cleanText=value=>String(value||"").toLowerCase().replace(/<[^>]+>/g," ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
function searchableArtifactText(bytes,contentType){
  const text=bytes?.toString("utf8")||"";if(!/json/i.test(contentType||""))return text;
  try{const data=JSON.parse(text),strings=[];const walk=value=>{if(typeof value==="string")strings.push(value);else if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==="object"){if(value.abstract_inverted_index&&typeof value.abstract_inverted_index==="object"){const words=[];for(const [word,indexes] of Object.entries(value.abstract_inverted_index))for(const index of indexes||[])words[index]=word;strings.push(words.filter(Boolean).join(" "));}for(const [key,item] of Object.entries(value))if(key!=="abstract_inverted_index")walk(item);}};walk(data);return strings.join(" ");}catch{return text;}
}

async function fetchArtifact(url,{fetchImpl=fetch,timeoutMs=25000,maxBytes=20*1024*1024}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{redirect:"follow",signal:controller.signal,headers:{"user-agent":"SYCLE Evidence Warehouse/1.0"}});
    if(!response.ok)return {retrieval_status:"unavailable",http_status:response.status,bytes:null,content_type:response.headers.get("content-type")||null,error:`HTTP ${response.status}`};
    const declared=Number(response.headers.get("content-length")||0);if(declared>maxBytes)return {retrieval_status:"metadata_only",http_status:response.status,bytes:null,content_type:response.headers.get("content-type")||null,byte_size:declared,error:"Artifact exceeds synchronous archive limit; queued for full ingestion"};
    const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length>maxBytes)return {retrieval_status:"metadata_only",http_status:response.status,bytes:null,content_type:response.headers.get("content-type")||null,byte_size:buffer.length,error:"Artifact exceeds synchronous archive limit; queued for full ingestion"};
    return {retrieval_status:"verified",http_status:response.status,bytes:buffer,content_type:response.headers.get("content-type")||"application/octet-stream",byte_size:buffer.length,checksum:checksum(buffer),final_url:response.url};
  }catch(error){return {retrieval_status:"unavailable",http_status:null,bytes:null,content_type:null,error:error.message};}
  finally{clearTimeout(timer);}
}

function stageForClaim(plan,claimId){return plan.lifecycle.stages.find(stage=>stage.claim_ids.includes(claimId))?.id||null;}

async function verifyAndPersistPlan(plan,{client=null,fetchImpl=fetch,now=new Date().toISOString()}={}){
  const datasets=[],versions=[],references=[],artifacts=new Map();
  for(const source of plan.sources){
    const auth=authority(source.url);const licence=licenceStatus(source);const datasetId=stableId("dataset",source.dataset_url||source.url);let artifact=await fetchArtifact(source.url,{fetchImpl});
    if(artifact.retrieval_status!=="verified"&&source.dataset_url&&source.dataset_url!==source.url)artifact=await fetchArtifact(source.dataset_url,{fetchImpl});artifacts.set(source.id,artifact);
    const mayArchive=["permitted","permitted_with_attribution"].includes(licence);let rawPath=null;
    if(client&&artifact.bytes&&mayArchive){rawPath=`sources/${datasetId}/${artifact.checksum}/${slug(source.title)}`;await client.upload(rawPath,artifact.bytes,artifact.content_type);}
    const versionChecksum=artifact.checksum||checksum(JSON.stringify({url:source.url,year:source.publication_year,retrieved_at:now,status:artifact.retrieval_status}));const versionId=stableId("dataset-version",`${datasetId}:${versionChecksum}`);
    datasets.push({id:datasetId,title:source.title,publisher:source.publisher,source_url:source.url,dataset_url:source.dataset_url,source_type:source.source_type,licence_name:source.licence_name,licence_url:source.licence_url,licence_status:licence,authority_score:auth.score,scope:{product:plan.intake.product,industry:plan.intake.industry,geography:plan.intake.country},status:artifact.retrieval_status==="verified"?(source.complete_dataset_available&&source.dataset_url&&source.dataset_url!==source.url?"queued":"active"):"discovered",last_checked_at:now,metadata:{authority_reason:auth.reason,complete_dataset_available:source.complete_dataset_available,agent_source_id:source.id}});
    versions.push({id:versionId,dataset_id:datasetId,publication_year:source.publication_year,retrieved_at:now,content_checksum:versionChecksum,raw_storage_path:rawPath,content_type:artifact.content_type,byte_size:artifact.byte_size||null,record_count:null,retrieval_status:artifact.retrieval_status,retrieval_http_status:artifact.http_status,metadata:{final_url:artifact.final_url||source.url,error:artifact.error||null}});
    references.push({id:source.id,dataset_id:datasetId,dataset_version_id:versionId,name:source.title,publisher:source.publisher,url:source.url,dataset_url:source.dataset_url,edition:source.publication_year?String(source.publication_year):"undated",retrieved_at:now,checksum:versionChecksum,licence_status:licence,authority_score:auth.score,retrieval_status:artifact.retrieval_status,raw_storage_path:rawPath,source_type:source.source_type});
  }
  const refByAgentId=new Map(references.map(item=>[item.id,item]));
  const claims=plan.claims.map(claim=>{
    const refs=claim.source_ids.map(id=>refByAgentId.get(id)).filter(Boolean);const primary=refs.find(ref=>ref.retrieval_status==="verified")||refs[0];const artifact=primary?artifacts.get(primary.id):null;const isText=artifact?.bytes&&/(text|html|json|xml|csv)/i.test(artifact.content_type||"");const quoteVerified=Boolean(isText&&cleanText(searchableArtifactText(artifact.bytes,artifact.content_type)).includes(cleanText(claim.evidence_quote)))||Boolean(claim.context?.discovery_verified);
    return {id:stableId("claim",`${plan.intake.product}:${claim.id}:${claim.statement}`),agent_claim_id:claim.id,dataset_version_id:primary?.dataset_version_id||null,product_key:plan.intake.product.toLowerCase(),industry:plan.intake.industry,lifecycle_stage_id:stageForClaim(plan,claim.id),claim_type:claim.claim_type,statement:claim.statement,evidence_quote:claim.evidence_quote,locator:claim.locator,geography:claim.geography,publication_year:claim.publication_year,confidence:claim.confidence,stakeholder:claim.stakeholder,risk_level:claim.risk_level,quote_verified:quoteVerified,source_ids:refs.map(ref=>ref.id),retrieval_verified:refs.some(ref=>ref.retrieval_status==="verified")};
  });
  const measurements=(plan.measurements||[]).map(item=>{
    const ref=refByAgentId.get(item.source_id),artifact=ref?artifacts.get(ref.id):null,isText=artifact?.bytes&&/(text|html|json|xml|csv)/i.test(artifact.content_type||"");
    return {id:stableId("measurement",`${item.indicator_id}:${item.geography}:${item.year}:${item.value}:${item.value_text}`),dataset_version_id:ref?.dataset_version_id||null,indicator_id:item.indicator_id,indicator_name:item.indicator_name,value:item.value,value_text:item.value_text,unit:item.unit,geography:item.geography,geography_level:item.geography_level,observation_year:item.year,evidence_quote:item.evidence_quote,locator:item.locator,interpretation:item.interpretation,confidence:item.confidence,quote_verified:Boolean(isText&&cleanText(artifact.bytes.toString("utf8")).includes(cleanText(item.evidence_quote)))||Boolean(item.context?.discovery_verified),retrieval_verified:ref?.retrieval_status==="verified",source:ref||null,context:item.context||null};
  });
  if(client){
    const existing=[];for(const item of datasets){const rows=await client.request(`sycle_dataset_library?select=id,status&id=eq.${encodeURIComponent(item.id)}&limit=1`);if(rows?.[0])existing.push(rows[0]);}const statusById=new Map(existing.map(item=>[item.id,item.status]));
    for(const item of datasets)if(["active","restricted"].includes(statusById.get(item.id)))item.status=statusById.get(item.id);
    await client.upsert("sycle_dataset_library",datasets);await client.upsert("sycle_dataset_versions",versions);
    const persistable=claims.filter(item=>item.dataset_version_id).map(({agent_claim_id,source_ids,retrieval_verified,...item})=>item);await client.upsert("sycle_evidence_claims",persistable);
    const storedMeasurements=measurements.filter(item=>item.dataset_version_id).map(({retrieval_verified,source,context,...item})=>item);await client.upsert("sycle_evidence_measurements",storedMeasurements);
    const jobs=datasets.filter(item=>item.status==="queued"&&item.dataset_url).map(item=>({dataset_id:item.id,dataset_url:item.dataset_url,status:"queued",next_attempt_at:now}));
    for(const job of jobs)await client.request("sycle_ingestion_jobs?on_conflict=dataset_id,dataset_url",{method:"POST",body:job,prefer:"resolution=ignore-duplicates,return=minimal"});
  }
  return {datasets,versions,references,claims,measurements};
}

async function processNextIngestionJob(client,{fetchImpl=fetch,maxBytes=10*1024*1024*1024,chunkBytes=20*1024*1024}={}){
  const jobs=await client.request(`sycle_ingestion_jobs?select=*&status=eq.queued&next_attempt_at=lte.${encodeURIComponent(new Date().toISOString())}&order=created_at.asc&limit=1`);const job=jobs?.[0];if(!job)return {status:"idle"};
  await client.request(`sycle_ingestion_jobs?id=eq.${job.id}`,{method:"PATCH",body:{status:"running",locked_at:new Date().toISOString(),attempts:job.attempts+1},prefer:"return=minimal"});
  try{
    const response=await fetchImpl(job.dataset_url,{redirect:"follow",headers:{"user-agent":"SYCLE Evidence Warehouse/1.0"}});if(!response.ok)throw new Error(`Dataset download HTTP ${response.status}`);
    const declared=Number(response.headers.get("content-length")||0);if(declared>maxBytes)throw new Error(`Dataset exceeds configured ${maxBytes} byte ingestion limit`);
    const contentType=response.headers.get("content-type")||"application/octet-stream",reader=response.body.getReader(),hasher=crypto.createHash("sha256"),chunks=[];let pending=Buffer.alloc(0),total=0,index=0;
    const flush=async buffer=>{const path=`datasets/${job.dataset_id}/ingestions/${job.id}/chunk-${String(index++).padStart(5,"0")}`;await client.upload(path,buffer,"application/octet-stream");chunks.push({path,bytes:buffer.length});};
    while(true){const {done,value}=await reader.read();if(done)break;const part=Buffer.from(value);total+=part.length;if(total>maxBytes)throw new Error(`Dataset exceeds configured ${maxBytes} byte ingestion limit`);hasher.update(part);pending=Buffer.concat([pending,part]);while(pending.length>=chunkBytes){await flush(pending.subarray(0,chunkBytes));pending=pending.subarray(chunkBytes);}}
    if(pending.length)await flush(pending);const digest=hasher.digest("hex"),manifestPath=`datasets/${job.dataset_id}/${digest}/manifest.json`,manifest=Buffer.from(JSON.stringify({dataset_id:job.dataset_id,source_url:job.dataset_url,content_type:contentType,byte_size:total,checksum:digest,chunks},null,2));await client.upload(manifestPath,manifest,"application/json");const versionId=stableId("dataset-version",`${job.dataset_id}:${digest}`);
    await client.upsert("sycle_dataset_versions",[{id:versionId,dataset_id:job.dataset_id,publication_year:null,retrieved_at:new Date().toISOString(),content_checksum:digest,raw_storage_path:manifestPath,content_type:contentType,byte_size:total,record_count:null,retrieval_status:"verified",retrieval_http_status:response.status,metadata:{complete_dataset:true,chunked:true,chunk_count:chunks.length,final_url:response.url}}]);
    await client.request(`sycle_dataset_library?id=eq.${job.dataset_id}`,{method:"PATCH",body:{status:"active",last_checked_at:new Date().toISOString()},prefer:"return=minimal"});
    await client.request(`sycle_ingestion_jobs?id=eq.${job.id}`,{method:"PATCH",body:{status:"complete",completed_at:new Date().toISOString(),last_error:null},prefer:"return=minimal"});return {status:"complete",dataset_id:job.dataset_id,bytes:total,chunks:chunks.length,checksum:digest};
  }catch(error){
    const attempts=job.attempts+1,status=attempts>=3?"failed":"queued";await client.request(`sycle_ingestion_jobs?id=eq.${job.id}`,{method:"PATCH",body:{status,last_error:error.message,next_attempt_at:new Date(Date.now()+attempts*3600000).toISOString()},prefer:"return=minimal"});return {status:"failed",dataset_id:job.dataset_id,error:error.message,retry:status==="queued"};
  }
}

module.exports={checksum,cleanText,fetchArtifact,processNextIngestionJob,searchableArtifactText,verifyAndPersistPlan};
