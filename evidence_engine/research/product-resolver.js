"use strict";

const {normalise,tokens}=require("../product-identity");

const GENERIC_PRODUCTS=new Set(["manufactured product","product","factory","facility","plant","operation","industry"]);
const JSON_CACHE=new Map();

async function fetchJson(url,{fetchImpl=fetch,timeoutMs=12000,retries=2,cacheMs=600000}={}){
  const cached=JSON_CACHE.get(url);if(cached&&Date.now()-cached.at<cacheMs)return structuredClone(cached.value);
  let lastError;for(let attempt=0;attempt<=retries;attempt++){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetchImpl(url,{signal:controller.signal,headers:{"user-agent":"SYCLE/1.0 (public evidence research; contact: support@sycle.app)",accept:"application/json"}});if((response.status===429||response.status>=500)&&attempt<retries){const wait=Math.min(3000,Number(response.headers.get("retry-after")||0)*1000||400*2**attempt);await new Promise(resolve=>setTimeout(resolve,wait));continue;}if(!response.ok)throw new Error(`HTTP ${response.status}`);const value=await response.json();JSON_CACHE.set(url,{at:Date.now(),value});return structuredClone(value);}catch(error){lastError=error;if(attempt<retries)await new Promise(resolve=>setTimeout(resolve,300*2**attempt));}finally{clearTimeout(timer);}
  }throw lastError;
}

function requestedProduct(spec){
  const direct=normalise(spec.product);if(direct&&!GENERIC_PRODUCTS.has(direct))return direct;
  const prompt=String(spec.prompt||"").replace(/\b(?:build|generate|create|analyse|analyze|assess|an?\s+s-?lca|social life cycle assessment|report)\b/gi," ");const match=prompt.match(/(?:for\s+)?(?:an?\s+)?([a-z][a-z0-9+\- ]{1,80}?)(?=\s+(?:factory|facility|plant|mill|refinery|manufactur|produc|processing|in\s+[A-Z])|,|$)/i);return normalise(match?.[1]||direct);
}

function scoreResult(product,result){const wanted=new Set(tokens(product)),text=new Set(tokens(`${result.label||""} ${result.description||""}`));const overlap=[...wanted].filter(token=>text.has(token)).length;return overlap*10+(normalise(result.label)===normalise(product)?20:0);}

async function resolveProduct(spec,answers={},options={}){
  const product=requestedProduct(spec);if(!product||GENERIC_PRODUCTS.has(product))return {status:"needs_clarification",questions:[{id:"product_definition",text:"What exact product or service is being assessed?",input_type:"text",placeholder:"For example: glazed ceramic floor tile",reason:"The exact product determines the manufacturing process, materials, and evidence search.",required:true}]};
  const url=`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(product)}&language=en&uselang=en&type=item&limit=8&format=json&origin=*`;let results=[];try{results=(await fetchJson(url,options)).search||[];}catch(error){results=[];}
  const ranked=results.map(item=>({...item,_score:scoreResult(product,item)})).filter(item=>item._score>0).sort((a,b)=>b._score-a._score),best=ranked[0]||null;
  const aliases=[product,...ranked.slice(0,4).map(item=>normalise(item.label)).filter(Boolean)];
  return {status:"resolved",identity:{requested_product:product,resolved_product:product,wikidata_id:best?.id||null,description:best?.description||null,aliases:[...new Set(aliases)],classifications:{isic:spec.classifications?.isic||[],naics:spec.classifications?.naics||[],hs:spec.classifications?.hs||[],wikidata:best?.id?[best.id]:[]},confidence:best&&best._score>=20?"H":best?"M":"L",evidence:best?[{source:"Wikidata",url,entity_id:best.id,label:best.label,description:best.description||null}]:[]},lookup_url:url};
}

module.exports={fetchJson,requestedProduct,resolveProduct,scoreResult};
