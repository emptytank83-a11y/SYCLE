"use strict";

// Ordinary code, not the model, decides whether an extracted fact is real:
// the quote must appear in the fetched page and the number must appear in the quote.

const MAX_QUOTE=240,MIN_QUOTE=12;

function normalise(value){
  return String(value??"").normalize("NFKC").toLowerCase()
    .replace(/[­​]/g,"").replace(/-\s*\n\s*/g,"")
    .replace(/[‘’‚′]/g,"'").replace(/[“”„″]/g,'"')
    .replace(/[‐-―−]/g,"-").replace(/\s+/g," ").trim();
}

// Every value a numeric token can legitimately mean. Separators only count as thousands marks when
// followed by exactly three digits, so "1.5" is never read as 15. "1,234" is ambiguous and yields both.
function readings(token){
  const out=[];
  if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token))out.push(token.replace(/,/g,""));
  if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(token))out.push(token.replace(/\./g,"").replace(",","."));
  if(/^\d{1,3}(\s\d{3})+([.,]\d+)?$/.test(token))out.push(token.replace(/\s/g,"").replace(",","."));
  if(/^\d+([.,]\d+)?$/.test(token))out.push(token.replace(",","."));
  return out.map(Number).filter(Number.isFinite);
}

function numbersIn(text){
  const found=new Set();
  for(const raw of String(text??"").normalize("NFKC").match(/\d[\d.,\s]*\d|\d/g)||[]){
    const token=raw.trim();
    for(const value of readings(token))found.add(value);
    for(const part of token.split(/\s+/))for(const value of readings(part.replace(/[.,]$/,"")))found.add(value);
  }
  return [...found];
}

const sameNumber=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
const valueInQuote=(value,quote)=>numbersIn(quote).some(item=>sameNumber(item,value));

function locateQuote(quote,text){
  const needle=normalise(quote),haystack=normalise(text);
  if(needle.length<MIN_QUOTE)return -1;
  return haystack.indexOf(needle);
}

// A year is only trusted if it appears in the quote or right next to it in the page.
function yearSupported(year,quote,text){
  if(!Number.isInteger(year))return false;
  const label=String(year);
  if(normalise(quote).includes(label))return true;
  const haystack=normalise(text),at=locateQuote(quote,text);
  return at>=0&&haystack.slice(Math.max(0,at-400),at+quote.length+400).includes(label);
}

function textValueSupported(valueText,quote){
  const quoteNorm=normalise(quote);
  const digits=String(valueText).match(/\d+/g)||[];
  if(digits.some(item=>!quoteNorm.includes(item)))return false;
  const words=normalise(valueText).split(/[^a-z0-9]+/).filter(word=>word.length>3);
  if(!words.length)return digits.length>0;
  return words.filter(word=>quoteNorm.includes(word)).length/words.length>=.5;
}

function verifyFact(fact,pageText){
  const reasons=[];
  const quote=String(fact?.quote??"").trim();
  if(quote.length<MIN_QUOTE)reasons.push("quote_too_short");
  if(quote.length>MAX_QUOTE)reasons.push("quote_too_long");
  if(!fact?.unit)reasons.push("missing_unit");
  const hasNumber=fact?.value!==null&&fact?.value!==undefined&&Number.isFinite(Number(fact.value));
  const hasText=typeof fact?.value_text==="string"&&fact.value_text.trim().length>0;
  if(!hasNumber&&!hasText)reasons.push("no_value");
  if(!reasons.length&&locateQuote(quote,pageText)<0)reasons.push("quote_not_on_page");
  if(!reasons.length&&hasNumber&&!valueInQuote(Number(fact.value),quote))reasons.push("number_not_in_quote");
  if(!reasons.length&&!hasNumber&&hasText&&!textValueSupported(fact.value_text,quote))reasons.push("text_value_not_in_quote");
  if(reasons.length)return {ok:false,reasons};
  const yearOk=yearSupported(Number(fact.year),quote,pageText);
  return {ok:true,reasons:[],year:yearOk?Number(fact.year):null,year_verified:yearOk};
}

module.exports={MAX_QUOTE,MIN_QUOTE,locateQuote,normalise,numbersIn,valueInQuote,verifyFact,yearSupported};
