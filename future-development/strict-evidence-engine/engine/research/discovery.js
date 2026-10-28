"use strict";

const crypto=require("node:crypto");
const {researchPlanSchema}=require("./schemas");
const {extractMaterials,extractProcessEvidence,parseDocument,topicsFor}=require("./document-parser");
const {fetchJson,resolveProduct}=require("./product-resolver");
const {normalise,tokens}=require("../product-identity");

const id=(prefix,value)=>`${prefix}-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0,12)}`;
const title=value=>String(value||"").replace(/\b\w/g,char=>char.toUpperCase());

function relevant(product,item){
  const wanted=new Set(tokens(product)),haystack=new Set(tokens(`${item.title||""} ${item.snippet||""}`));return [...wanted].some(token=>haystack.has(token));
}
function relevanceScore(product,item){const wanted=tokens(product),titleList=tokens(item.title),titleTokens=new Set(titleList),allTokens=new Set(tokens(`${item.title||""} ${item.snippet||""}`));const titleOverlap=wanted.filter(token=>titleTokens.has(token)).length,allOverlap=wanted.filter(token=>allTokens.has(token)).length,exact=normalise(item.title)===normalise(product)?30:0,allTitle=wanted.length>1&&titleOverlap===wanted.length?18:0,specificity=titleList.length>1?4:-6,processBonus=/extract|production|manufactur|refin|fiberboard|recycl|processing|vitrified|porcelain|encaustic|quarry/i.test(item.title||"")?4:0,noisePenalty=/company|companies|people|list of|history of|in the united states|in india|in chile/i.test(item.title||"")?8:0;return exact+allTitle+titleOverlap*8+allOverlap*2+specificity+processBonus-noisePenalty;}

async function wikipediaSearch(product,options={}){
  const queries=[`${product} manufacturing process`,`${product} production`,`${product} processing recycling`],found=new Map();
  for(const query of queries){
    const url=`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=8`;try{const data=await fetchJson(url,options);for(const page of data.pages||[]){const item={title:page.title,key:page.key,snippet:page.excerpt||page.description||""};if(/\b(?:holdings?|limited|plc|incorporated|corporation)\b|\bindustries$/i.test(item.title))continue;if(relevant(product,item)&&!found.has(item.title))found.set(item.title,item);}}catch(error){/* The next query or warehouse cache may still succeed. */}
  }
  const minimum=tokens(product).length>1?18:6;
  return [...found.values()].filter(item=>relevanceScore(product,item)>=minimum).sort((a,b)=>relevanceScore(product,b)-relevanceScore(product,a)).slice(0,4);
}

async function wikipediaDocuments(product,options={}){
  const results=await wikipediaSearch(product,options),documents=[];
  for(const result of results){
    const pageKey=result.key||result.title.replaceAll(" ","_"),contentUrl=`https://en.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(pageKey)}/html`;try{let response;for(let attempt=0;attempt<3;attempt++){response=await (options.fetchImpl||fetch)(contentUrl,{headers:{"user-agent":"SYCLE/1.0 (public evidence research; contact: support@sycle.app)"}});if(response.status!==429&&response.status<500)break;await new Promise(resolve=>setTimeout(resolve,400*2**attempt));}if(!response?.ok)continue;const bytes=Buffer.from(await response.arrayBuffer()),parsed=parseDocument(bytes,response.headers.get("content-type")||"text/html",contentUrl);if(parsed.text.length<200)continue;documents.push({source_id:id("wiki",result.title),title:result.title,url:contentUrl,canonical_url:`https://en.wikipedia.org/wiki/${encodeURIComponent(pageKey)}`,publisher:"Wikipedia contributors",publication_year:null,source_type:"open_knowledge",licence_name:"CC BY-SA 4.0",licence_url:"https://creativecommons.org/licenses/by-sa/4.0/",text:parsed.text});}catch(error){/* Continue with other retrieved documents. */}
  }
  return documents;
}

async function academicMetadata(product,options={}){
  const query=`${product} manufacturing process supply chain`,url=`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=5&select=id,display_name,publication_year,doi,primary_location,open_access`;try{const data=await fetchJson(url,options);return (data.results||[]).filter(item=>relevant(product,{title:item.display_name})).slice(0,3).map(item=>({id:id("openalex",item.id),title:item.display_name,publisher:"OpenAlex indexed research",url:item.doi||item.primary_location?.landing_page_url||item.id,dataset_url:null,publication_year:item.publication_year||null,source_type:"academic",licence_name:item.open_access?.is_oa?"Open-access status reported by OpenAlex":null,licence_url:null,complete_dataset_available:false,authority_reason:"Scholarly metadata discovered through the open OpenAlex index"}));}catch(error){return [];}
}

function abstractText(inverted){
  if(!inverted||typeof inverted!=="object")return "";const positions=[];for(const [word,indexes] of Object.entries(inverted))for(const index of indexes||[])positions[index]=word;return positions.filter(Boolean).join(" ");
}
function socialIdentity(text){
  if(/child labou?r|young worker/i.test(text))return {stakeholder:"children",topic:"child labour"};
  if(/community|land right|indigenous|resettlement|water access/i.test(text))return {stakeholder:"local_communities",topic:"community and land rights"};
  if(/corruption|governance|bribery/i.test(text))return {stakeholder:"society",topic:"governance and corruption"};
  if(/consumer|product safety|privacy/i.test(text))return {stakeholder:"consumers",topic:"consumer health and safety"};
  if(/supplier|supply chain|procurement/i.test(text))return {stakeholder:"value_chain_actors",topic:"responsible sourcing"};
  return {stakeholder:"workers",topic:/injur|safety|exposure|health/i.test(text)?"occupational health and safety":"working conditions"};
}
async function academicSocialEvidence(product,stages,country,options={}){
  const sources=[],claims=[],seen=new Set(),fetchImpl=options.fetchImpl||fetch;
  for(const stage of stages.slice(0,6)){
    const query=`${product} ${stage.title} ${stage.social_risks.join(" ")} ${country} labour safety social`,url=`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=4&select=id,display_name,publication_year,doi,primary_location,open_access,abstract_inverted_index`;
    let data;try{data=await fetchJson(url,{...options,fetchImpl});}catch{continue;}
    const work=(data.results||[]).find(item=>relevant(product,{title:`${item.display_name||""} ${abstractText(item.abstract_inverted_index)}`})&&abstractText(item.abstract_inverted_index).length>120);if(!work||seen.has(work.id))continue;seen.add(work.id);
    const abstract=abstractText(work.abstract_inverted_index),sentence=(abstract.match(/[^.!?]+[.!?]+/g)||[abstract]).find(item=>/labou?r|worker|wage|safety|health|community|human right|supplier|corruption|gender|injur|exposure/i.test(item));if(!sentence)continue;
    const quote=sentence.replace(/\s+/g," ").trim().slice(0,240),workId=String(work.id).split("/").pop(),sourceId=id("openalex-social",work.id),claimId=`social-claim-${stage.id}`,identity=socialIdentity(quote);
    sources.push({id:sourceId,title:work.display_name,publisher:work.primary_location?.source?.display_name||"OpenAlex-indexed research",url:`https://api.openalex.org/works/${encodeURIComponent(workId)}`,dataset_url:null,publication_year:work.publication_year||null,source_type:"academic",licence_name:work.open_access?.is_oa?"Open-access metadata via OpenAlex":"OpenAlex CC0 metadata; article terms apply",licence_url:"https://creativecommons.org/publicdomain/zero/1.0/",complete_dataset_available:false,authority_reason:"Product-, stage-, topic- and geography-specific scholarly evidence discovered through OpenAlex"});
    claims.push({id:claimId,statement:`Published research reports a ${identity.topic} consideration relevant to ${stage.title.toLowerCase()} for ${product}.`,claim_type:"social_risk",source_ids:[sourceId],evidence_quote:quote,locator:"OpenAlex abstract",geography:country||null,publication_year:work.publication_year||null,confidence:"M",stakeholder:identity.stakeholder,risk_level:null});
    stage.claim_ids.push(claimId);if(!stage.social_risks.some(item=>normalise(item)===normalise(identity.topic)))stage.social_risks.push(identity.topic);
  }
  return {sources,claims};
}

function actorFor(stage){if(/extract|harvest|cultivat|quarr/i.test(stage))return "Raw-material producer";if(/packag|distribution/i.test(stage))return "Logistics and distribution operator";if(/use|maintenance/i.test(stage))return "Operator and service provider";if(/recovery|end of life/i.test(stage))return "Recovery and waste operator";return "Product processor or manufacturer";}
function logisticsFor(stage){if(/extract|material preparation/i.test(stage))return "Origin-to-processor route; actual supplier and transport mode require confirmation";if(/packag|distribution/i.test(stage))return "Outbound distribution route; destinations and carriers require confirmation";if(/recovery|end of life/i.test(stage))return "Collection-to-recovery route; actual take-back and waste routes require confirmation";return "Inter-stage transfer; facility and supplier routes require confirmation";}

async function discoverResearchPlan(spec,answers={},options={}){
  const resolved=await resolveProduct(spec,answers,options);if(resolved.status==="needs_clarification")return {status:"needs_clarification",questions:resolved.questions};const identity=resolved.identity;
  const documents=await wikipediaDocuments(identity.resolved_product,options);if(!documents.length){const error=new Error("No retrievable product-process document was found in the free evidence sources");error.code="free_source_discovery_empty";throw error;}
  const extractedProcess=extractProcessEvidence(documents,identity.resolved_product),genericActions=new Set(["Manufacturing","Construction","Operations"]),process=extractedProcess.length>4?extractedProcess.filter(item=>!genericActions.has(item.title)):extractedProcess;if(process.length<3){const error=new Error("Retrieved documents did not contain enough distinct product-process evidence to construct a defensible lifecycle");error.code="insufficient_product_process_evidence";throw error;}
  const materials=extractMaterials(documents.map(item=>item.text).join(" "),identity.resolved_product),perCategory=new Map(),selected=[];for(const item of process){const count=perCategory.get(item.category)||0,maxForCategory=/raw material|material preparation|separation|refining|forming|thermal/i.test(item.category)?2:1;if(count>=maxForCategory)continue;perCategory.set(item.category,count+1);selected.push(item);if(selected.length===14)break;}const foregroundIndex=Math.max(0,Math.min(selected.length-1,selected.findIndex(item=>/refining|purification|mixing|forming|thermal|fabrication|finishing/i.test(item.category))));
  const sources=documents.map(document=>({id:document.source_id,title:document.title,publisher:document.publisher,url:document.url,dataset_url:null,publication_year:document.publication_year,source_type:document.source_type,licence_name:document.licence_name,licence_url:document.licence_url,complete_dataset_available:false,authority_reason:"Open knowledge document used only to map product terminology and documented process stages"}));
  const stages=selected.map((item,index)=>({id:`stage-${index+1}`,title:`${title(identity.resolved_product)}: ${item.title}`,description:`Retrieved process evidence for ${identity.resolved_product}: ${item.quote}`,inputs:index===0&&materials.length?materials:[identity.resolved_product],outputs:[identity.resolved_product],actor:actorFor(item.category),foreground:index===foregroundIndex,likely_countries:[],social_risks:topicsFor(item.category),logistics:logisticsFor(item.category),claim_ids:[`claim-${index+1}`]}));
  const claims=selected.map((item,index)=>({id:`claim-${index+1}`,statement:`Retrieved evidence identifies ${item.title.toLowerCase()} within the ${identity.resolved_product} product process.`,claim_type:"process",source_ids:[item.source_id],evidence_quote:item.quote,locator:`Retrieved document text; matched process term: ${item.process_term}`,geography:null,publication_year:null,confidence:item.score>=3?"H":"M",stakeholder:null,risk_level:null}));
  const social=await academicSocialEvidence(identity.resolved_product,stages,spec.country,options);sources.push(...social.sources);claims.push(...social.claims);
  const sourceIds=new Set(sources.map(item=>item.id));for(const claim of claims)claim.source_ids=claim.source_ids.filter(sourceId=>sourceIds.has(sourceId));
  const country=spec.country,countryCode=spec.countryCode,region=spec.region||null,locality=spec.locality||null,boundary=answers.system_boundary||spec.answers?.system_boundary||"cradle_to_grave";
  const plan={product_identity:identity,intake:{product:identity.resolved_product,industry:spec.sectorLabel&&spec.sectorKey!=="generic"?spec.sectorLabel:`${title(identity.resolved_product)} production`,facility_activity:answers.operating_scope||spec.answers?.operating_scope||"product processing",technology:spec.technology||null,country,country_code:countryCode,region,locality,scale_value:Number.isFinite(Number(spec.qty))?Number(spec.qty):null,scale_unit:spec.scaleUnit||null,timeframe:spec.timeframe||null,boundary,classifications:{isic:identity.classifications.isic||[],naics:identity.classifications.naics||[],hs:identity.classifications.hs||[]}},clarification_questions:[],lifecycle:{summary:`A source-derived ${boundary.replaceAll("_","-")} process map for ${identity.resolved_product}; supplier identities and unstated routes remain primary-data requirements.`,stages},evidence_requirements:stages.map((stage,index)=>({id:`requirement-${index+1}`,stage_ids:[stage.id],topic:stage.social_risks.join("; "),geography_level:stage.foreground?"region":"supply_chain_country",preferred_source_types:["official_document","academic","open_knowledge"],search_query:`${identity.resolved_product} ${normalise(stage.title)} social labour safety evidence`})),sources,claims,measurements:[],recommendations:stages.slice(0,3).map((stage,index)=>({title:`Verify ${stage.title.toLowerCase()}`,action:`Confirm named suppliers, locations, workforce conditions, and control evidence for ${stage.title.toLowerCase()}.`,rationale:`The retrieved product-process evidence establishes the stage, while facility and supplier performance still requires primary evidence.`,priority:index===0?"immediate":"near_term",claim_ids:stage.claim_ids}))};
  return {status:"complete",plan:researchPlanSchema.parse(plan),discovery:{mode:"free_open_evidence",documents:documents.map(item=>({title:item.title,url:item.canonical_url,source_id:item.source_id})),academic_sources:sources.filter(item=>item.source_type==="academic").length}};
}

module.exports={abstractText,academicMetadata,academicSocialEvidence,discoverResearchPlan,relevanceScore,relevant,wikipediaDocuments,wikipediaSearch};
