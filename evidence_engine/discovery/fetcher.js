"use strict";

const crypto=require("node:crypto");
const {parseDocument}=require("../research/document-parser");

const USER_AGENT="SYCLEBot/1.0 (+https://github.com/emptytank83-a11y/SYCLE; evidence research)";
const MAX_BYTES=15*1024*1024,MAX_TEXT=2_000_000;

// Minimal robots.txt: our own group beats "*"; longest matching rule wins; Allow wins ties.
function parseRobots(body){
  const groups=[];let current=null;
  for(const raw of String(body||"").split(/\r?\n/)){
    const line=raw.replace(/#.*/,"").trim();const at=line.indexOf(":");if(at<0)continue;
    const field=line.slice(0,at).trim().toLowerCase(),value=line.slice(at+1).trim();
    if(field==="user-agent"){if(!current||current.rules.length)groups.push(current={agents:[],rules:[]});current.agents.push(value.toLowerCase());}
    else if(current&&(field==="disallow"||field==="allow")&&value)current.rules.push({allow:field==="allow",path:value});
  }
  const mine=groups.find(group=>group.agents.some(agent=>agent!=="*"&&USER_AGENT.toLowerCase().includes(agent)))||groups.find(group=>group.agents.includes("*"));
  return mine?.rules||[];
}
function robotsAllows(rules,pathname){
  let best=null;
  for(const rule of rules){
    const pattern=new RegExp("^"+rule.path.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*").replace(/\\\$$/,"$"));
    if(pattern.test(pathname)&&(!best||rule.path.length>best.path.length||(rule.path.length===best.path.length&&rule.allow)))best=rule;
  }
  return !best||best.allow;
}

function createFetcher({fetchImpl=fetch,timeoutMs=20000,pdfText=defaultPdfText}={}){
  const robots=new Map();
  async function timed(url,init={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{return await fetchImpl(url,{redirect:"follow",signal:controller.signal,...init,headers:{"user-agent":USER_AGENT,...(init.headers||{})}});}
    finally{clearTimeout(timer);}
  }
  async function allowed(url){
    const {origin,pathname,search}=new URL(url);
    if(!robots.has(origin))robots.set(origin,timed(`${origin}/robots.txt`).then(async response=>response.ok?parseRobots(await response.text()):[]).catch(()=>[]));
    return robotsAllows(await robots.get(origin),pathname+search);
  }
  async function fetchDocument(url){
    try{
      if(!/^https?:/i.test(url))return {ok:false,url,error:"unsupported_scheme"};
      if(!await allowed(url))return {ok:false,url,error:"blocked_by_robots_txt"};
      const response=await timed(url);
      if(!response.ok)return {ok:false,url,error:`http_${response.status}`};
      const declared=Number(response.headers.get("content-length")||0);
      if(declared>MAX_BYTES)return {ok:false,url,error:"too_large"};
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>MAX_BYTES)return {ok:false,url,error:"too_large"};
      const contentType=response.headers.get("content-type")||"";
      const isPdf=/pdf/i.test(contentType)||bytes.subarray(0,5).toString("latin1")==="%PDF-";
      let text;
      if(isPdf){text=await pdfText(bytes).catch(()=>"");if(text.length<200)text=parseDocument(bytes,"application/pdf",url).text||text;}
      else text=parseDocument(bytes,contentType||"text/html",url).text||"";
      text=text.replace(/[ \t]+/g," ").slice(0,MAX_TEXT);
      if(text.length<80)return {ok:false,url,error:"no_readable_text"};
      return {ok:true,url:response.url||url,requested_url:url,text,content_type:contentType,checksum:crypto.createHash("sha256").update(bytes).digest("hex"),retrieved_at:new Date().toISOString()};
    }catch(error){return {ok:false,url,error:error.name==="AbortError"?"timeout":error.message};}
  }
  return {fetchDocument,allowed};
}

async function defaultPdfText(bytes){
  const {extractText,getDocumentProxy}=await import("unpdf");
  const pdf=await getDocumentProxy(new Uint8Array(bytes));
  const {text}=await extractText(pdf,{mergePages:true});
  return String(text||"");
}

module.exports={USER_AGENT,createFetcher,parseRobots,robotsAllows};
