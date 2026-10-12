"use strict";

const crypto=require("node:crypto");
const {discoverResearchPlan}=require("./discovery");
const {authority}=require("./source-policy");
const {createWarehouseClient}=require("../warehouse/client");
const {verifyAndPersistPlan}=require("../warehouse/dataset-ingestion");
const {lifecycleCompatibility,productCompatibility}=require("../product-identity");
const {stableId}=require("../warehouse/client");

const hash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function fallbackSummary(bundle){
  return {
    existing_sources:(bundle?.sources||[]).map(item=>({id:item.id,name:item.name,publisher:item.publisher,source_type:item.source_type,update_cadence:item.update_cadence})),
    cached_process_model:bundle?.profile?{id:bundle.profile.id,sector_key:bundle.profile.sector_key,variant:bundle.profile.variant,product_patterns:bundle.profile.product_patterns}:null,
    reusable_claims:[]
  };
}

function validatePlanStructure(plan,evidence){
  const errors=[],warnings=[];const sourceIds=new Set(plan.sources.map(item=>item.id)),claimIds=new Set(plan.claims.map(item=>item.id));const evidenceByClaim=new Map(evidence.claims.map(item=>[item.agent_claim_id,item]));
  for(const source of plan.sources){const rank=authority(source.url);if(rank.score<55)errors.push({code:"unacceptable_source_authority",source:source.id,url:source.url});}
  for(const claim of plan.claims){
    if(claim.source_ids.some(id=>!sourceIds.has(id)))errors.push({code:"claim_source_missing",claim:claim.id});
    const verified=evidenceByClaim.get(claim.id);if(!verified?.retrieval_verified)warnings.push({code:"claim_excluded_source_not_retrieved",claim:claim.id});
    if(!verified?.quote_verified)warnings.push({code:"quote_not_machine_verified",claim:claim.id,locator:claim.locator});
  }
  for(const stage of plan.lifecycle.stages){
    if(stage.claim_ids.some(id=>!claimIds.has(id)))errors.push({code:"stage_claim_missing",stage:stage.id});
    if(!stage.claim_ids.some(id=>evidenceByClaim.get(id)?.retrieval_verified))errors.push({code:"stage_without_retrieved_evidence",stage:stage.id});
  }
  if(!plan.lifecycle.stages.some(item=>item.foreground))errors.push({code:"foreground_activity_unresolved"});
  return {valid:errors.length===0,errors,warnings};
}

async function loadCachedEvidence(client,plan){
  if(!client)return null;const productKey=plan.intake.product.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const stored=await client.request(`sycle_evidence_claims?select=*&product_key=eq.${encodeURIComponent(productKey)}&limit=200`);if(!stored?.length)return null;
  const versionIds=[...new Set(stored.map(item=>item.dataset_version_id).filter(Boolean))],versions=versionIds.length?await client.request(`sycle_dataset_versions?select=*&id=in.(${versionIds.join(",")})`):[];
  const datasetIds=[...new Set((versions||[]).map(item=>item.dataset_id))],datasets=datasetIds.length?await client.request(`sycle_dataset_library?select=*&id=in.(${datasetIds.join(",")})`):[];
  const versionById=new Map((versions||[]).map(item=>[item.id,item])),datasetById=new Map((datasets||[]).map(item=>[item.id,item]));
  const references=[];for(const version of versions||[]){const dataset=datasetById.get(version.dataset_id);if(!dataset)continue;references.push({id:dataset.metadata?.agent_source_id||stableId("source",dataset.id),dataset_id:dataset.id,dataset_version_id:version.id,name:dataset.title,publisher:dataset.publisher,url:dataset.source_url,dataset_url:dataset.dataset_url,edition:version.publication_year?String(version.publication_year):"undated",retrieved_at:version.retrieved_at,checksum:version.content_checksum,licence_status:dataset.licence_status,authority_score:dataset.authority_score,retrieval_status:version.retrieval_status,raw_storage_path:version.raw_storage_path,source_type:dataset.source_type});}
  const byStoredId=new Map(stored.map(item=>[item.id,item])),claims=plan.claims.map(claim=>{const id=stableId("claim",`${plan.intake.product}:${claim.id}:${claim.statement}`),item=byStoredId.get(id),version=item&&versionById.get(item.dataset_version_id);return item?{...item,agent_claim_id:claim.id,source_ids:references.filter(ref=>ref.dataset_version_id===item.dataset_version_id).map(ref=>ref.id),retrieval_verified:version?.retrieval_status==="verified"}:null;}).filter(Boolean);
  return {datasets:datasets||[],versions:versions||[],references,claims,measurements:[]};
}

async function persistLifecycle(client,plan,researchSnapshot){
  if(!client||!plan.product_identity)return null;const identity=plan.product_identity,productKey=identity.resolved_product.toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),identityId=stableId("product",productKey);
  await client.upsert("sycle_product_identities",[{id:identityId,product_key:productKey,requested_product:identity.requested_product,resolved_product:identity.resolved_product,wikidata_id:identity.wikidata_id,description:identity.description,confidence:identity.confidence,evidence:identity.evidence,updated_at:new Date().toISOString()}]);
  await client.upsert("sycle_product_aliases",identity.aliases.map(alias=>({id:stableId("alias",`${identityId}:${alias.toLowerCase()}`),product_identity_id:identityId,alias,normalized_alias:alias.toLowerCase().replace(/[^a-z0-9]+/g," ").trim()})));
  const classifications=[];for(const [scheme,codes] of Object.entries(identity.classifications||{}))for(const code of codes)classifications.push({id:stableId("classification",`${identityId}:${scheme}:${code}`),product_identity_id:identityId,scheme,code,evidence:{source:"product resolver"}});await client.upsert("sycle_product_classifications",classifications);
  const prior=await client.request(`sycle_lifecycle_profiles?select=id,version,evidence_checksum&product_key=eq.${encodeURIComponent(productKey)}&order=version.desc&limit=1`),latest=prior?.[0];if(latest?.evidence_checksum===researchSnapshot.checksum)return {identity_id:identityId,profile_id:latest.id,version:latest.version,reused:true};
  const version=Number(latest?.version||0)+1,profileId=stableId("lifecycle",`${productKey}:${version}:${researchSnapshot.checksum}`);if(latest)await client.request(`sycle_lifecycle_profiles?product_key=eq.${encodeURIComponent(productKey)}&status=eq.active`,{method:"PATCH",body:{status:"superseded"},prefer:"return=minimal"});
  await client.upsert("sycle_lifecycle_profiles",[{id:profileId,product_identity_id:identityId,product_key:productKey,version,boundary:plan.intake.boundary,summary:plan.lifecycle.summary,research_plan:plan,evidence_checksum:researchSnapshot.checksum,status:"active"}]);
  const stages=plan.lifecycle.stages.map((stage,index)=>({id:stableId("process-stage",`${profileId}:${stage.id}`),lifecycle_profile_id:profileId,ordinal:index+1,title:stage.title,description:stage.description,actor:stage.actor,foreground:stage.foreground,inputs:stage.inputs,outputs:stage.outputs,social_risks:stage.social_risks,logistics:stage.logistics,evidence_claim_ids:stage.claim_ids}));await client.upsert("sycle_process_stages",stages);
  const edges=stages.slice(1).map((stage,index)=>({id:stableId("process-edge",`${stages[index].id}:${stage.id}`),lifecycle_profile_id:profileId,from_stage_id:stages[index].id,to_stage_id:stage.id,flow_label:plan.lifecycle.stages[index].outputs.join(", "),evidence_claim_ids:[...new Set([...plan.lifecycle.stages[index].claim_ids,...plan.lifecycle.stages[index+1].claim_ids])]}));await client.upsert("sycle_process_edges",edges);
  const materials=[...new Set(plan.lifecycle.stages.flatMap(stage=>[...stage.inputs,...stage.outputs]))].map(name=>({id:stableId("material",name.toLowerCase()),normalized_name:name.toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),display_name:name,metadata:{source:"lifecycle extraction"}}));await client.upsert("sycle_materials",materials);await client.upsert("sycle_lifecycle_materials",materials.map(material=>({id:stableId("lifecycle-material",`${profileId}:${material.id}`),lifecycle_profile_id:profileId,material_id:material.id})));return {identity_id:identityId,profile_id:profileId,version,reused:false};
}

async function researchProduct(spec,answers,bundle,options={}){
  const client=options.warehouseClient===undefined?createWarehouseClient(options):options.warehouseClient;
  const progress=async(status,percent,message)=>{if(options.onProgress)await options.onProgress({status,progress:percent,message});};
  let warehouseSummary=fallbackSummary(bundle);
  if(client){try{warehouseSummary=await client.catalogueSummary(spec.product,spec.region||spec.country);}catch(error){warehouseSummary.warning=error.message;}}
  let cached=null;if(!options.researchPlan&&client)try{cached=await client.findLifecycle(spec.product);}catch(error){warehouseSummary.lifecycle_warning=error.message;}
  await progress("discovering_sources",cached?42:45,cached?"Reusing the verified product lifecycle":"Searching free public sources for the product lifecycle");
  const discovered=options.researchPlan?{status:"complete",plan:require("./schemas").researchPlanSchema.parse(options.researchPlan),discovery:{mode:"fixture"}}:cached?{status:"complete",plan:require("./schemas").researchPlanSchema.parse(cached.research_plan),discovery:{mode:"central_lifecycle_cache",profile_id:cached.id}}:await discoverResearchPlan(spec,answers,{...options,warehouseSummary});
  if(discovered.status==="needs_clarification")return discovered;const plan=discovered.plan;
  if(plan.clarification_questions.length)return {status:"needs_clarification",questions:plan.clarification_questions.map(item=>({...item,required:true}))};
  const intakeProduct=productCompatibility(spec.product,plan.intake.product),lifecycleProduct=lifecycleCompatibility(plan.intake.product,plan.lifecycle.stages);
  if(!intakeProduct.compatible||!lifecycleProduct.compatible){
    const error=new Error("Product-specific research returned a lifecycle that does not match the requested product");error.code="product_research_mismatch";error.details={requested_product:spec.product,resolved_product:plan.intake.product,intake_product:intakeProduct,lifecycle_product:lifecycleProduct};throw error;
  }
  await progress("retrieving_evidence",56,cached?"Loading the saved evidence snapshot":"Retrieving, checking, and versioning source evidence");
  let acquired=cached?await loadCachedEvidence(client,plan):null;if(!acquired||plan.lifecycle.stages.some(stage=>!stage.claim_ids.some(id=>acquired.claims.some(claim=>claim.agent_claim_id===id&&claim.retrieval_verified))))acquired=await verifyAndPersistPlan(plan,{client,fetchImpl:options.fetchImpl||fetch});const validation=validatePlanStructure(plan,acquired);
  const verifiedClaims=acquired.claims.filter(item=>item.retrieval_verified&&item.dataset_version_id),verifiedMeasurements=acquired.measurements.filter(item=>item.retrieval_verified&&item.dataset_version_id);
  const evidence={...acquired,claims:verifiedClaims,measurements:verifiedMeasurements};const claimByAgentId=new Map(verifiedClaims.map(item=>[item.agent_claim_id,item]));
  const stages=plan.lifecycle.stages.map((stage,index)=>({
    id:stage.id||`stage-${index+1}`,title:stage.title,description:stage.description,inputs:stage.inputs,outputs:stage.outputs,actor:stage.actor,
    countries:stage.foreground?[plan.intake.region||plan.intake.locality||plan.intake.country]:stage.likely_countries,
    country_basis:stage.foreground?"User-confirmed facility geography":"Evidence-retrieved production or supply-chain geography; not a named supplier",
    evidence:stage.claim_ids.map(id=>claimByAgentId.get(id)?.id).filter(Boolean),evidence_claims:stage.claim_ids.map(id=>claimByAgentId.get(id)).filter(Boolean),
    screening_topics:stage.social_risks,logistics:stage.logistics,foreground:stage.foreground,confidence:stage.claim_ids.every(id=>claimByAgentId.get(id)?.retrieval_verified)?"H":"M"
  }));
  const recommendations=plan.recommendations.map(item=>({...item,claim_ids:item.claim_ids.map(id=>claimByAgentId.get(id)?.id).filter(Boolean)})).filter(item=>item.claim_ids.length);
  const researchSnapshot={id:`research-${hash({plan,evidence:evidence.versions.map(item=>item.content_checksum) }).slice(0,18)}`,checksum:hash({plan,evidence:evidence.versions.map(item=>item.content_checksum)}),generated_at:new Date().toISOString(),mode:cached?"central_lifecycle_cache":"dynamic_research",discovery:discovered.discovery,warehouse_summary:warehouseSummary};const lifecycleRecord=cached?{profile_id:cached.id,version:cached.version,reused:true}:await persistLifecycle(client,plan,researchSnapshot);
  return {status:"complete",plan,evidence,validation,product_identity:{source:"dynamic_research",requested_product:spec.product,resolved_product:plan.intake.product,compatible:true,intake_product:intakeProduct,lifecycle_product:lifecycleProduct,identity:plan.product_identity||null},stages,recommendations,references:evidence.references,research_snapshot:researchSnapshot,lifecycle_record:lifecycleRecord};
}

module.exports={loadCachedEvidence,persistLifecycle,researchProduct,validatePlanStructure};
