"use strict";

// Keyless document search over open scholarly and development-agency indexes. It returns candidates in the same
// shape as a paid search API, so the rest of discovery does not care which is in use. Items that already carry their
// text (abstracts) skip the page fetch.

const {abstractText}=require("../research/discovery");

const USER_AGENT="SYCLEBot/1.0 (+https://github.com/emptytank83-a11y/SYCLE; open-data research)";

// Paid engines understand site: and OR; the open indexes do not.
const clean=query=>String(query).replace(/site:\S+/gi," ").replace(/\b(?:OR|AND)\b/g," ").replace(/["()]/g," ").replace(/\s+/g," ").trim();

function createOpenSearch({fetchImpl=fetch,timeoutMs=20000}={}){
  async function getJson(url){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{const response=await fetchImpl(url,{signal:controller.signal,headers:{"user-agent":USER_AGENT,accept:"application/json"}});return response.ok?await response.json():null;}
    catch{return null;}finally{clearTimeout(timer);}
  }

  async function openAlex(query,count){
    const data=await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${count}&select=id,display_name,publication_year,doi,primary_location,abstract_inverted_index`);
    return (data?.results||[]).map(work=>{
      const text=abstractText(work.abstract_inverted_index);
      const url=work.doi||work.primary_location?.landing_page_url||work.id;
      return {title:work.display_name||"Scholarly work",url,snippet:text.slice(0,200),text:text.length>=200?`${work.display_name}. ${text}`:null,year:work.publication_year||null};
    }).filter(item=>item.url);
  }

  async function worldBankDocuments(query,count){
    const data=await getJson(`https://search.worldbank.org/api/v3/wds?format=json&qterm=${encodeURIComponent(query)}&rows=${count}&fl=display_title,pdfurl,txturl,docdt,docty,count`);
    return Object.values(data?.documents||{}).map(doc=>({title:doc.display_title||"World Bank document",url:doc.pdfurl||doc.txturl,snippet:`${doc.docty||""} ${doc.count||""}`.trim(),text:null,year:doc.docdt?Number(String(doc.docdt).slice(0,4)):null})).filter(item=>item.url);
  }

  const search=async(query,{count=6}={})=>{
    const q=clean(query);if(!q)return [];
    const [papers,documents]=await Promise.all([openAlex(q,count).catch(()=>[]),worldBankDocuments(q,Math.ceil(count/2)).catch(()=>[])]);
    return [...documents,...papers];
  };
  search.provider="open-indexes";
  return search;
}

module.exports={clean,createOpenSearch};
