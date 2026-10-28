"use strict";

// Source trust: rules first, optional model judgement for unknown publishers.
// Every decision carries a human-readable reason so reviewers can audit it.

const CLASS_SCORE=Object.freeze({
  government:100,intergovernmental:96,standards_body:85,academic:80,ngo_index:70,company_statement:60,news:50,unverified:40,background_only:0,blocked:0
});
const NOT_FOR_FACTS=new Set(["unverified","background_only","blocked"]);

// Starter list: global sources that cover (almost) every country. Used as the ladder's safety net.
const STARTER_SOURCES=Object.freeze([
  {host:"ilostat.ilo.org",name:"ILOSTAT",tags:["labour","wages","hours","union","child","gender","unemployment","safety"]},
  {host:"ilo.org",name:"International Labour Organization",tags:["labour","child","forced","union","safety"]},
  {host:"data.worldbank.org",name:"World Bank Open Data",tags:["economy","labour","governance","gender","unemployment"]},
  {host:"data.oecd.org",name:"OECD Data",tags:["labour","wages","hours","economy","gender"]},
  {host:"who.int",name:"World Health Organization",tags:["health","air","consumer"]},
  {host:"data.unicef.org",name:"UNICEF Data",tags:["child","health","education"]},
  {host:"fao.org",name:"FAO / FAOSTAT",tags:["agriculture","food","land"]},
  {host:"ec.europa.eu",name:"Eurostat",tags:["labour","wages","safety","economy"]},
  {host:"data.un.org",name:"UNdata",tags:["economy","education","health"]},
  {host:"uis.unesco.org",name:"UNESCO Institute for Statistics",tags:["education","child"]},
  {host:"globalrightsindex.org",name:"ITUC Global Rights Index",tags:["union","rights","labour"]},
  {host:"walkfree.org",name:"Walk Free Global Slavery Index",tags:["forced","child","rights"]},
  {host:"dol.gov",name:"US Department of Labor ILAB",tags:["child","forced","labour"]},
  {host:"transparency.org",name:"Transparency International CPI",tags:["governance"]},
  {host:"imf.org",name:"IMF Data",tags:["economy"]}
]);

const INTERGOVERNMENTAL=["un.org","ilo.org","worldbank.org","oecd.org","who.int","unicef.org","unep.org","undp.org","fao.org","unesco.org","imf.org","wto.org","iea.org","irena.org","europa.eu","oecd-ilibrary.org","unido.org","unhcr.org","iom.int","ifc.org","adb.org","afdb.org","iadb.org"];
const STANDARDS=["iso.org","iec.ch","cencenelec.eu","ansi.org","astm.org","bsigroup.com","din.de","afnor.org"];
const NGO_INDEX=["globalrightsindex.org","ituc-csi.org","walkfree.org","transparency.org","hrw.org","amnesty.org","fairlabor.org","ethicaltrade.org","amfori.org","fairtrade.net","verite.org"];
const ACADEMIC=["doi.org","arxiv.org","sciencedirect.com","springer.com","link.springer.com","nature.com","wiley.com","onlinelibrary.wiley.com","tandfonline.com","mdpi.com","plos.org","sagepub.com","jstor.org","cambridge.org","oup.com","academic.oup.com","frontiersin.org","openalex.org","semanticscholar.org","researchgate.net","pubmed.ncbi.nlm.nih.gov"];
const NEWS=["reuters.com","apnews.com","bbc.com","bbc.co.uk","ft.com","theguardian.com","bloomberg.com","nytimes.com","aljazeera.com","dw.com","economist.com","wsj.com","france24.com","scmp.com"];
const BACKGROUND=["wikipedia.org","wikimedia.org","wikidata.org","britannica.com"];
const BLOCKED=/(?:^|\.)(?:blogspot|wordpress|medium|substack|tumblr|wixsite|weebly|reddit|quora|facebook|twitter|x|instagram|tiktok|youtube|pinterest|wikihow|answers|yahoo|linkedin)\.[a-z.]+$/;
// gov / gob / gouv / govt / gv / go / government as a second-level label, or a bare .gov / .mil-style TLD.
const GOVERNMENT=/(?:^|\.)(?:gov|gob|gouv|govt|gv|go|gub|government|gc|admin|bund|overheid|regeringen|regjeringen|valtioneuvosto)\.[a-z]{2,3}$|(?:^|\.)gov$|(?:^|\.)admin\.ch$|(?:^|\.)bund\.de$|(?:^|\.)gc\.ca$|(?:^|\.)nic\.in$/;
const ACADEMIC_HOST=/(?:^|\.)(?:edu|ac)\.[a-z]{2,3}$|(?:^|\.)edu$/;

function hostOf(url){try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"");}catch{return "";}}
const inList=(host,list)=>list.find(item=>host===item||host.endsWith(`.${item}`));

function classifyByRule(url){
  const host=hostOf(url);
  if(!host)return {host,class:"blocked",score:0,usable:false,reason:"Invalid URL",source:"rule"};
  const result=(klass,reason)=>({host,class:klass,score:CLASS_SCORE[klass],usable:!NOT_FOR_FACTS.has(klass),corroborate:klass==="news"||klass==="company_statement",reason,source:"rule"});
  if(inList(host,BACKGROUND))return result("background_only","Encyclopaedic background; used to understand terms, never as a source of facts");
  if(BLOCKED.test(host))return result("blocked","Blog, forum or social platform; not an accountable publisher");
  if(GOVERNMENT.test(host))return result("government","Government publisher (domain pattern)");
  const inter=inList(host,INTERGOVERNMENTAL);if(inter)return result("intergovernmental",`Intergovernmental body (${inter})`);
  if(host.endsWith(".int"))return result("intergovernmental","Treaty-based international organisation (.int domain)");
  const standards=inList(host,STANDARDS);if(standards)return result("standards_body",`Standards body (${standards})`);
  if(ACADEMIC_HOST.test(host))return result("academic","Academic institution domain");
  const academic=inList(host,ACADEMIC);if(academic)return result("academic",`Scholarly publisher or index (${academic})`);
  const ngo=inList(host,NGO_INDEX);if(ngo)return result("ngo_index",`Recognised rights or labour index (${ngo})`);
  const news=inList(host,NEWS);if(news)return result("news",`News outlet (${news}); use for recent events and cross-checking`);
  return result("unverified","Publisher not recognised by rules");
}

const JUDGE_CLASSES=new Set(["government","intergovernmental","standards_body","academic","ngo_index","company_statement","news","unverified","blocked"]);

// judge(url,{title,snippet}) -> {class,publisher,reason}. A model-assigned class is capped below rule-verified
// government and flagged for review, so a wrong judgement is visible and cannot silently reach top trust.
async function classifySource(url,context={},{judge=null,registry=null}={}){
  const byRule=classifyByRule(url);
  if(byRule.class!=="unverified")return byRule;
  const known=registry?await registry.getHost(byRule.host):null;
  if(known&&known.review_status!=="rejected"){
    const score=known.review_status==="approved"?(CLASS_SCORE[known.class]??known.trust_score):Math.min(known.trust_score,85);
    return {host:byRule.host,class:known.class,score,usable:!NOT_FOR_FACTS.has(known.class),corroborate:["news","company_statement"].includes(known.class),reason:`${known.reason} (registry, ${known.review_status})`,source:"registry",needs_review:known.review_status==="pending_review"};
  }
  if(!judge)return byRule;
  let verdict=null;try{verdict=await judge(url,context);}catch{verdict=null;}
  if(!verdict||!JUDGE_CLASSES.has(verdict.class)||!verdict.reason)return byRule;
  const score=Math.min(CLASS_SCORE[verdict.class],85);
  return {host:byRule.host,class:verdict.class,score,usable:!NOT_FOR_FACTS.has(verdict.class),corroborate:["news","company_statement"].includes(verdict.class),reason:`Model judgement: ${String(verdict.reason).slice(0,240)}`,publisher:verdict.publisher||null,source:"judge",needs_review:score>=60};
}

const SOURCE_TYPE=Object.freeze({government:"official_document",intergovernmental:"official_dataset",standards_body:"industry_standard",academic:"academic",ngo_index:"industry_publication",company_statement:"industry_publication",news:"industry_publication"});
const sourceTypeFor=klass=>SOURCE_TYPE[klass]||"industry_publication";

function starterHostsFor(tag,limit=3){return STARTER_SOURCES.filter(item=>item.tags.includes(tag)).slice(0,limit);}

module.exports={CLASS_SCORE,STARTER_SOURCES,classifyByRule,classifySource,hostOf,sourceTypeFor,starterHostsFor};
