"use strict";

const GENERIC_TERMS=new Set([
  "agriculture","assembly","crop","device","electronics","equipment","facility","factory","farm","food","goods","industry","manufactured","manufacturing","material","operation","operations","plant","plantation","processing","product","production","refinery","report","service","services","smelter"
]);

const STOP_WORDS=new Set([
  ...GENERIC_TERMS,"a","an","and","annual","annually","assessment","at","build","building","cycle","for","from","generate","in","life","new","of","on","per","project","social","the","to","unit","units","year","years"
]);

function normalise(value){
  return String(value||"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
}

function tokens(value){
  return normalise(value).split(" ").filter(token=>token.length>1&&!STOP_WORDS.has(token));
}

function phrasePresent(text,phrase){
  const haystack=` ${normalise(text)} `,needle=normalise(phrase);return Boolean(needle)&&haystack.includes(` ${needle} `);
}

function meaningfulPattern(pattern){
  const value=normalise(pattern);if(!value||GENERIC_TERMS.has(value))return false;
  return tokens(value).length>0;
}

function requestedProductText(spec={}){
  return [spec.product,spec.prompt].filter(Boolean).join(" ");
}

function productCompatibility(requested,candidate){
  const requestedTokens=new Set(tokens(requested)),candidateTokens=new Set(tokens(candidate));
  const overlap=[...requestedTokens].filter(token=>candidateTokens.has(token));
  const compatible=Boolean(overlap.length)||(normalise(requested).length>2&&normalise(candidate).length>2&&(phrasePresent(requested,candidate)||phrasePresent(candidate,requested)));
  return {compatible,requested:normalise(requested),candidate:normalise(candidate),overlap};
}

function profileCompatibility(spec,profile){
  if(!profile)return {compatible:false,requested_product:normalise(spec?.product),profile_id:null,matched_pattern:null,reason:"No cached product profile was found."};
  const text=requestedProductText(spec);const patterns=(profile.product_patterns||[]).filter(meaningfulPattern).sort((a,b)=>b.length-a.length);
  const matched=patterns.find(pattern=>phrasePresent(text,pattern));
  return {compatible:Boolean(matched),requested_product:normalise(spec?.product),profile_id:profile.id||null,matched_pattern:matched||null,reason:matched?"The requested product explicitly matches a product-specific cached profile.":"The cached profile belongs to a different product, even if it shares a broad sector."};
}

function lifecycleCompatibility(product,stages=[]){
  const corpus=stages.map(stage=>[stage.title,stage.description,...(stage.inputs||[]),...(stage.outputs||[])].join(" ")).join(" ");
  const comparison=productCompatibility(product,corpus);
  return {...comparison,reason:comparison.compatible?"The lifecycle contains the requested product identity.":"The lifecycle does not contain the requested product identity."};
}

module.exports={lifecycleCompatibility,meaningfulPattern,normalise,phrasePresent,productCompatibility,profileCompatibility,requestedProductText,tokens};
