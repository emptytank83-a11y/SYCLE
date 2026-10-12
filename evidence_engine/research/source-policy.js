"use strict";

const AUTHORITATIVE_HOSTS=Object.freeze([
  "un.org","ilo.org","worldbank.org","oecd.org","who.int","unep.org","undp.org","fao.org","iea.org","irena.org",
  "dol.gov","bls.gov","census.gov","osha.gov","energy.gov","usgs.gov","epa.gov","nist.gov","europa.eu","ec.europa.eu",
  "transparency.org","globalrightsindex.org","walkfree.org","kimberleyprocess.com","doi.org","wikidata.org","wikipedia.org","wikimedia.org","openalex.org","crossref.org"
]);

function hostname(url){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}}
function isGovernmentHost(host){return /(?:^|\.)gov(?:\.[a-z]{2})?$/.test(host)||/(?:^|\.)gouv\.[a-z]{2}$/.test(host)||/(?:^|\.)govt\.nz$/.test(host);}
function authority(url){
  const host=hostname(url);if(!host)return {accepted:false,score:0,reason:"Invalid URL"};
  if(isGovernmentHost(host))return {accepted:true,score:100,reason:"Government publisher"};
  const matched=AUTHORITATIVE_HOSTS.find(item=>host===item||host.endsWith(`.${item}`));
  if(matched)return {accepted:true,score:95,reason:`Approved authoritative domain: ${matched}`};
  if(/\.edu(?:\.[a-z]{2})?$/.test(host)||/\.ac\.[a-z]{2}$/.test(host))return {accepted:true,score:80,reason:"Academic institution"};
  return {accepted:true,score:55,reason:"Industry source requiring corroboration"};
}

function licenceStatus(source){
  const text=`${source.licence_name||""} ${source.licence_url||""}`.toLowerCase();
  if(/cc0|public domain|u\.s\. government|open government/.test(text))return "permitted";
  if(/cc by|creative commons|open data|odc|ilo open/.test(text))return "permitted_with_attribution";
  if(/prohibit|restricted|subscription|commercial licence|required license/.test(text))return "restricted";
  return "review_required";
}

module.exports={AUTHORITATIVE_HOSTS,authority,hostname,licenceStatus};
