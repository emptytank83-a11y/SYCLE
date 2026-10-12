"use strict";

// Rule-based fact extraction: no model, no key. It looks for a sentence that names the indicator, mentions the
// place, and carries a number next to the indicator's unit. The result is still checked by verifyFact, and facts from
// this path are graded no higher than medium confidence because sentence matching can misread context.

const {numbersIn,verifyFact}=require("./verify");

const STOP=new Set(["rate","level","total","share","requirement","with","from","that","this","law","index"]);
const words=text=>String(text).toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>3&&!STOP.has(word));

function cueFor(unit){
  const u=String(unit).toLowerCase();
  if(/per 100,?000/.test(u))return /per\s+100[,. ]?000/i;
  if(/%/.test(u))return /%|per\s?cent|percent/i;
  if(/hours/.test(u))return /hours?\b/i;
  if(/(usd|currency)/.test(u))return /(?:per|a)\s+(?:hour|month|week|day|year)|minimum wage|usd|\$|€|£/i;
  if(/g\/m|µg|μg/.test(u))return /µg|μg|ug\/m|micrograms?/i;
  if(/days/.test(u))return /\bdays?\b/i;
  return /\d/;
}

const sentencesOf=text=>String(text).replace(/\s+/g," ").split(/(?<=[.!?;])\s+(?=[A-Z0-9"“(])/).map(item=>item.trim()).filter(item=>item.length>=25);
const SPECIFIC_UNIT=/per 100,?000|%|hours|g\/m|µg|μg/i;
const YEAR=/\b(?:19|20)\d{2}\b/g;

function countryNames(place){
  const names=[place.country,place.label].filter(Boolean).map(item=>item.toLowerCase());
  return [...new Set(names.flatMap(item=>[item,item.replace(/^the /,"")]))];
}

function bestNumber(sentence,cue){
  const cueMatch=sentence.match(cue);if(!cueMatch)return null;
  const at=cueMatch.index,candidates=[];
  for(const match of sentence.matchAll(/\d[\d.,\s]*\d|\d/g)){
    const token=match[0].trim();
    if(/^(?:19|20)\d{2}$/.test(token))continue;
    const values=numbersIn(token);if(!values.length)continue;
    candidates.push({value:values[0],distance:Math.abs(match.index-at),token});
  }
  return candidates.sort((a,b)=>a.distance-b.distance)[0]||null;
}

function trimQuote(sentence,around){
  if(sentence.length<=230)return sentence;
  const start=Math.max(0,around-110);
  return sentence.slice(start,start+230).trim();
}

function extractLocal({question,document,trust,maxFacts=3}){
  const indicator=question.indicator,text=document.text,lower=text.toLowerCase();
  const qualitative=indicator.unit==="qualitative";
  // Precision over recall: only well-known sources, and only units a sentence can state unambiguously.
  if(!trust||trust.score<75)return {accepted:[],rejected:[{reasons:["source_trust_too_low_for_rules"]}]};
  if(!qualitative&&!SPECIFIC_UNIT.test(indicator.unit))return {accepted:[],rejected:[{reasons:["unit_not_reliably_matchable"]}]};
  const keywords=words(question.kind==="benchmark"?indicator.benchmark:indicator.name),names=countryNames(question.place);
  const placed=names.some(name=>lower.includes(name));
  if(!placed)return {accepted:[],rejected:[{reasons:["place_not_mentioned"]}]};
  const sentences=sentencesOf(text),accepted=[],rejected=[];
  const cue=cueFor(indicator.unit);
  const need=Math.min(question.kind==="benchmark"?3:2,keywords.length);
  for(let index=0;index<sentences.length&&accepted.length<maxFacts;index++){
    const sentence=sentences[index],low=sentence.toLowerCase();
    if(keywords.filter(word=>low.includes(word)).length<need)continue;
    const nearby=`${sentences[index-1]||""} ${sentence}`.toLowerCase();
    if(!names.some(name=>nearby.includes(name)))continue;
    const year=(sentence.match(YEAR)||[]).map(Number).filter(value=>value>=1990&&value<=new Date().getFullYear()+1).pop()||null;
    if(qualitative){
      if(!trust||trust.score<85||!/\b(?:must|shall|required|requires|obliged|prohibit(?:s|ed)?|law|act|regulation|legislation)\b/i.test(sentence))continue;
      const quote=trimQuote(sentence,0),fact={value:null,value_text:quote.slice(0,200),unit:"qualitative",year,geography:question.place.country,scope:"country",quote,locator:"matched sentence"};
      const check=verifyFact(fact,text);if(!check.ok){rejected.push({fact,reasons:check.reasons});continue;}
      accepted.push({...fact,year:check.year,year_verified:check.year_verified,method:"rule"});continue;
    }
    const picked=bestNumber(sentence,cue);if(!picked)continue;
    const quote=trimQuote(sentence,sentence.indexOf(picked.token));
    const fact={value:picked.value,value_text:null,unit:indicator.unit,year,geography:question.place.country,scope:question.place.region&&low.includes(String(question.place.region).toLowerCase())?"region":"country",quote,locator:"matched sentence"};
    const check=verifyFact(fact,text);
    if(!check.ok){rejected.push({fact,reasons:check.reasons});continue;}
    accepted.push({...fact,year:check.year,year_verified:check.year_verified,method:"rule"});
  }
  return {accepted,rejected};
}

module.exports={cueFor,extractLocal,sentencesOf};
