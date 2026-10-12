"use strict";

const AdmZip=require("adm-zip");

const PROCESS_TERMS=Object.freeze([
  ["raw material extraction",/\b(?:min(?:e|ed|ing)|extract(?:ed|ion|ing)?|quarr(?:y|ied|ying)|harvest(?:ed|ing)?|cultivat(?:e|ed|ion|ing))\b/i,10],
  ["material preparation",/\b(?:crush(?:ed|ing)?|grind(?:ing|ground)?|mill(?:ed|ing)?|wash(?:ed|ing)?|sort(?:ed|ing)?|clean(?:ed|ing)?)\b/i,20],
  ["separation and concentration",/\b(?:separat(?:e|ed|ion|ing)|concentrat(?:e|ed|ion|ing)|flotation|filter(?:ed|ing|ation)?|screen(?:ed|ing)?|clarif(?:y|ied|ication)|centrifug(?:e|ed|ation|ing))\b/i,30],
  ["refining and purification",/\b(?:refin(?:e|ed|ery|ing)|purif(?:y|ied|ication)|affin(?:e|ed|ation)|carbonat(?:e|ed|ion)|decolouri[sz](?:e|ed|ation)|electrorefin(?:e|ed|ing)|smelt(?:ed|ing)?)\b/i,40],
  ["mixing and formulation",/\b(?:mix(?:ed|ing)?|blend(?:ed|ing)?|formulat(?:e|ed|ion|ing)|compound(?:ed|ing)?)\b/i,50],
  ["forming and conversion",/\b(?:crystalli[sz](?:e|ed|ation|ing)|corrugat(?:e|ed|ing|ion)|die[- ]cut(?:ting)?|fold(?:ed|ing)?|glu(?:e|ed|ing)|bond(?:ed|ing)?|slot(?:ted|ting)?|scor(?:e|ed|ing)|form(?:ed|ing)?|mould(?:ed|ing)?|mold(?:ed|ing)?|press(?:ed|ing)?|cast(?:ing)?|roll(?:ed|ing)?|extrud(?:e|ed|ing)|cut(?:ting)?|convert(?:ed|ing)?)\b/i,60],
  ["thermal or chemical processing",/\b(?:evaporat(?:e|ed|ion|ing)|boil(?:ed|ing)?|fir(?:e|ed|ing)|kiln|heat(?:ed|ing)?|bake(?:d|ing)?|spray[- ]dry(?:ing|ied)?|dry(?:ing|ied)|cure(?:d|ing)?|react(?:ed|ion)|ferment(?:ed|ation|ing))\b/i,70],
  ["fabrication and assembly",/\b(?:fabricat(?:e|ed|ion|ing)|assembl(?:e|ed|y|ing)|manufactur(?:e|ed|ing)|construct(?:ed|ion|ing))\b/i,80],
  ["finishing and quality control",/\b(?:finish(?:ed|ing)?|polish(?:ed|ing)?|coat(?:ed|ing)?|glaz(?:e|ed|ing)|print(?:ed|ing)?|inspect(?:ed|ion|ing)|test(?:ed|ing)?)\b/i,90],
  ["packaging and distribution",/\b(?:packag(?:e|ed|ing)|transport(?:ed|ation|ing)?|distribut(?:e|ed|ion|ing)|ship(?:ped|ping)?)\b/i,100],
  ["use and maintenance",/\b(?:install(?:ed|ation|ing)|operat(?:e|ed|ion|ing)|maintain(?:ed|ing)|maintenance|use phase)\b/i,110],
  ["recovery and end of life",/\b(?:recycl(?:e|ed|ing)|recover(?:ed|y|ing)|reuse(?:d)?|dispos(?:e|ed|al)|end[- ]of[- ]life|dismantl(?:e|ed|ing))\b/i,120]
]);

const TOPICS=Object.freeze({
  "raw material extraction":["occupational safety","land and community rights","forced and child labour screening"],
  "material preparation":["dust exposure","machinery safety","working hours"],
  "separation and concentration":["chemical exposure","water access","worker safety"],
  "refining and purification":["chemical exposure","process safety","contractor conditions"],
  "mixing and formulation":["chemical handling","worker training","process safety"],
  "forming and conversion":["machinery safety","ergonomics","working hours"],
  "thermal or chemical processing":["heat exposure","air emissions and community health","process safety"],
  "fabrication and assembly":["wages and working hours","freedom of association","ergonomics"],
  "finishing and quality control":["chemical exposure","repetitive work","product safety"],
  "packaging and distribution":["driver safety","working hours","contract labour"],
  "use and maintenance":["user safety","service-worker conditions","accessibility"],
  "recovery and end of life":["informal work","hazardous exposure","waste-community impacts"]
});

function decodeEntities(value){
  return String(value||"").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;|&#34;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)));
}

function htmlText(value){
  const text=decodeEntities(String(value||"").replace(/<(script|style|sup|table|figure|nav|footer|aside)\b[\s\S]*?<\/\1>/gi," ").replace(/<\/(?:p|li|h[1-6]|section|div)>/gi,". ").replace(/<[^>]+>/g," ")).replace(/\[[0-9]+\]/g," ").replace(/\s+/g," ").trim();const cutoff=[" References. "," Further Reading. "," External Links. "," See Also. "].map(marker=>text.toLowerCase().indexOf(marker.toLowerCase())).filter(index=>index>500).sort((a,b)=>a-b)[0];return cutoff?text.slice(0,cutoff):text;
}

function flattenJson(value,path=[],rows=[]){
  if(value===null||value===undefined)return rows;
  if(Array.isArray(value)){value.forEach((item,index)=>flattenJson(item,[...path,String(index)],rows));return rows;}
  if(typeof value==="object"){Object.entries(value).forEach(([key,item])=>flattenJson(item,[...path,key],rows));return rows;}
  rows.push(`${path.join(".")}: ${String(value)}`);return rows;
}

function parseCsv(text){
  const lines=String(text||"").split(/\r?\n/).filter(Boolean);if(!lines.length)return {text:"",rows:[]};
  const split=line=>{const values=[];let value="",quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'&&line[i+1]==='"'){value+='"';i++;}else if(char==='"')quoted=!quoted;else if(char===","&&!quoted){values.push(value.trim());value="";}else value+=char;}values.push(value.trim());return values;};
  const headers=split(lines[0]),rows=lines.slice(1,501).map((line,index)=>Object.fromEntries(headers.map((header,column)=>[header||`column_${column+1}`,split(line)[column]||""])));return {text:rows.map(row=>Object.entries(row).map(([key,value])=>`${key}: ${value}`).join("; ")).join(". "),rows};
}

function printablePdfText(buffer){
  const raw=Buffer.from(buffer).toString("latin1");const strings=[...raw.matchAll(/\(([^()]*)\)\s*Tj|\[([^\]]+)\]\s*TJ/g)].map(match=>match[1]||match[2]||"");return strings.join(" ").replace(/\\[nrt]/g," ").replace(/\\([()\\])/g,"$1").replace(/\s+/g," ").trim();
}

function xmlValues(xml){return [...String(xml||"").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)].map(match=>decodeEntities(match[1].replace(/<[^>]+>/g,"")));}

function parseXlsx(buffer){
  const archive=new AdmZip(buffer),entries=archive.getEntries(),sharedEntry=entries.find(item=>item.entryName==="xl/sharedStrings.xml"),shared=sharedEntry?xmlValues(sharedEntry.getData().toString("utf8")):[],rows=[];
  for(const entry of entries.filter(item=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(item.entryName)).slice(0,25)){
    const xml=entry.getData().toString("utf8");for(const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)){
      const values=[];for(const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)){const type=/\bt="([^"]+)"/i.exec(cell[1])?.[1],raw=/<v>([\s\S]*?)<\/v>/i.exec(cell[2])?.[1]??/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/i.exec(cell[2])?.[1]??"";values.push(type==="s"?shared[Number(raw)]||"":decodeEntities(raw));}if(values.length)rows.push(values);if(rows.length>=5000)break;
    }if(rows.length>=5000)break;
  }
  const headers=rows.shift()||[],records=rows.map((values,index)=>Object.fromEntries(headers.map((header,column)=>[String(header||`column_${column+1}`),values[column]??""])));return {text:records.map(row=>Object.entries(row).map(([key,value])=>`${key}: ${value}`).join("; ")).join(". "),rows:records};
}

function parseZip(buffer){
  const archive=new AdmZip(buffer),entries=[],texts=[];let total=0;
  for(const entry of archive.getEntries().filter(item=>!item.isDirectory).slice(0,200)){const bytes=entry.getData();total+=bytes.length;if(total>50*1024*1024)break;const name=entry.entryName.toLowerCase();if(!/\.(?:html?|csv|json|xml|txt|pdf)$/i.test(name))continue;const parsed=parseDocument(bytes,"",name);entries.push({name:entry.entryName,format:parsed.format,rows:parsed.rows?.length||0});if(parsed.text)texts.push(`${entry.entryName}: ${parsed.text}`);}return {text:texts.join(". "),rows:[],entries};
}

function parseDocument(bytes,contentType="text/plain",url=""){
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes||"");const type=String(contentType||"").toLowerCase(),name=String(url||"").toLowerCase();
  if(type.includes("json")||name.endsWith(".json")){const parsed=JSON.parse(buffer.toString("utf8"));return {format:"json",text:htmlText(flattenJson(parsed).join(". ")),rows:[]};}
  if(type.includes("csv")||name.endsWith(".csv"))return {format:"csv",...parseCsv(buffer.toString("utf8"))};
  if(type.includes("spreadsheet")||name.endsWith(".xlsx"))return {format:"xlsx",...parseXlsx(buffer)};
  if(type.includes("zip")||name.endsWith(".zip"))return {format:"zip",...parseZip(buffer)};
  if(type.includes("html")||name.endsWith(".html")||name.endsWith(".htm"))return {format:"html",text:htmlText(buffer.toString("utf8")),rows:[]};
  if(type.includes("xml")||name.endsWith(".xml"))return {format:"xml",text:htmlText(buffer.toString("utf8")),rows:[]};
  if(type.includes("pdf")||name.endsWith(".pdf"))return {format:"pdf",text:printablePdfText(buffer),rows:[]};
  return {format:"text",text:buffer.toString("utf8").replace(/\s+/g," ").trim(),rows:[]};
}

function sentences(text){return String(text||"").split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(item=>item.replace(/\s+/g," ").trim()).filter(item=>item.length>=35&&item.length<=900);}
function quote(value,maxWords=28,maxChars=240){
  let result=String(value||"").split(/\s+/).slice(0,maxWords).join(" ").replace(/[,:;]+$/,".");
  if(result.length>maxChars)result=result.slice(0,maxChars+1).replace(/\s+\S*$/," ").trim();
  return result.slice(0,maxChars).replace(/[,:;]+$/,".");
}
function excerptAround(sentence,index,maxWords=28){const before=sentence.slice(0,index).split(/\s+/),after=sentence.slice(index).split(/\s+/),words=[...before.slice(-8),...after.slice(0,Math.max(1,maxWords-8))];return quote(words.join(" "),maxWords);}

function actionTitle(term){
  const value=String(term||"").toLowerCase();
  const actions=[
    [/cultivat/,"Cultivation"],[/harvest/,"Harvesting"],[/min(?:e|ed|ing)/,"Mining"],[/extract/,"Extraction"],[/quarr/,"Quarrying"],
    [/crush/,"Crushing"],[/grind/,"Grinding"],[/mill/,"Milling"],[/wash/,"Washing"],[/sort/,"Sorting"],[/flotation/,"Froth flotation"],
    [/filter/,"Filtration"],[/clarif/,"Clarification"],[/centrifug/,"Centrifugation"],[/separat/,"Separation"],[/concentrat/,"Concentration"],
    [/affin/,"Affination"],[/carbonat/,"Carbonatation"],[/decolouri[sz]/,"Decolourisation"],[/electrorefin/,"Electrorefining"],[/smelt/,"Smelting"],
    [/refin/,"Refining"],[/purif/,"Purification"],[/mix/,"Mixing"],[/blend/,"Blending"],[/formulat/,"Formulation"],[/crystalli[sz]/,"Crystallisation"],
    [/corrugat/,"Corrugating"],[/die[- ]cut/,"Die cutting"],[/fold/,"Folding"],[/glu|bond/,"Bonding"],[/slot/,"Slotting"],[/scor/,"Scoring"],[/mould|mold/,"Moulding"],[/press/,"Pressing"],[/extrud/,"Extrusion"],[/cast/,"Casting"],[/roll/,"Rolling"],[/cut/,"Cutting"],[/form/,"Forming"],
    [/convert/,"Conversion"],[/evaporat/,"Evaporation"],[/boil/,"Boiling"],[/spray[- ]dry/,"Spray drying"],[/dry/,"Drying"],
    [/kiln|fir(?:e|ed|ing)/,"Firing"],[/heat/,"Heat treatment"],[/bake/,"Baking"],[/cure/,"Curing"],[/ferment/,"Fermentation"],
    [/assembl/,"Assembly"],[/fabricat/,"Fabrication"],[/manufactur/,"Manufacturing"],[/construct/,"Construction"],[/glaz/,"Glazing"],
    [/finish/,"Finishing"],[/polish/,"Polishing"],[/coat/,"Coating"],[/glaz/,"Glazing"],[/print/,"Printing"],[/inspect/,"Inspection"],[/test/,"Testing"],[/packag/,"Packaging"],[/transport/,"Transport"],
    [/distribut/,"Distribution"],[/ship/,"Shipping"],[/install/,"Installation"],[/maint/,"Maintenance"],[/use phase/,"Use phase"],[/operat/,"Operations"],
    [/recycl/,"Recycling"],[/recover/,"Recovery"],[/reuse/,"Reuse"],[/dismantl/,"Dismantling"],[/dispos/,"Disposal"],[/react/,"Chemical reaction"]
  ];
  return actions.find(([pattern])=>pattern.test(value))?.[1]||"Documented processing";
}

function extractMaterials(text,product){
  const found=[];for(const sentence of sentences(text)){
    const match=sentence.match(/\b(?:made|produced|manufactured|formed|composed|consists?)\s+(?:mainly\s+)?(?:of|from|using)\s+([^.;]{3,180})/i)||sentence.match(/\braw materials?\s+(?:include|are|used are)\s+([^.;]{3,180})/i);if(!match)continue;
    for(const part of match[1].split(/,|\band\b|\bor\b/i)){const material=part.replace(/\([^)]*\)/g," ").replace(/\b(?:which|that|with|for|into|during|after)\b[\s\S]*/i," ").replace(/[^a-zA-Z0-9+\- ]/g," ").replace(/\s+/g," ").trim();if(material.length>=2&&material.length<=60&&!material.toLowerCase().includes(String(product).toLowerCase()))found.push(material);}
  }return [...new Set(found.map(item=>item.toLowerCase()))].slice(0,12).map(item=>item.replace(/\b\w/g,char=>char.toUpperCase()));
}

function extractProcessEvidence(documents,product){
  const productTokens=tokensForMatch(product),escaped=String(product).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),context=/\b(?:process|processing|production|manufactur|raw material|feedstock|ore|solution|mixture|stage|step|first|next|then|after|before|into|from|using|used to|made|produced|formed|loaded|fed|sent to|method)\b/i,noise=/\b(?:references|bibliography|isbn|retrieved from|see also|disambiguation|citation needed|main article|archaeolog|artifact|sherd|museum|world's largest|company|crush resistance|not to be confused|for other uses|classifications?|analysis involves|small seatings|little tables|trees? not cut)\b/i,definitionNoise=/\b(?:cannot be|formulat(?:e|ing) polic|undertake studies|germination|internment|residual sugar|called .{0,30} because|because .{0,80} manufactured|something was manufactured)\b/i,candidates=[];for(const document of documents){const titleTokens=new Set(tokensForMatch(document.title)),titleOverlap=productTokens.filter(token=>titleTokens.has(token)).length;for(const sentence of sentences(document.text)){if(noise.test(sentence)||!context.test(sentence))continue;const sentenceTokens=new Set(tokensForMatch(sentence));if(!productTokens.some(token=>sentenceTokens.has(token)))continue;for(const [category,pattern,rank] of PROCESS_TERMS){const match=sentence.match(pattern);if(!match)continue;if(/^quarry$/i.test(match[0])&&/\bquarry tile\b/i.test(sentence))continue;if(category==="finishing and quality control"&&!/\b(?:is|are|was|were|be|being)\s+(?:\w+\s+){0,2}(?:coated|glazed|polished|finished|printed)|\b(?:coating|glazing|polishing|finishing|printing)\s+(?:process|stage|operation)|\bapply\w*\s+(?:a\s+)?(?:coating|glaze|finish|print)/i.test(sentence))continue;const snippet=excerptAround(sentence,match.index||0,28);if(snippet.length<20)continue;const action=actionTitle(match[0]),sourceSpecific=/\b(?:factory|manufactur|production|processing|extraction|refin|recycl|mill)\b/i.test(document.title),processSyntax=/\b(?:then|after|before|undergoes|starts? by|followed by|factory|processing plant|raw (?:juice|material|ore)|crystals?|industrially produced)\b/i.test(sentence),strongTransformation=/\b(?:made|produced|manufactured)\s+from\b|\bundergoes\b|\b(?:is|are)\s+(?:then\s+)?(?:washed|crushed|ground|refined|purified|pressed|fired|dried|packaged|printed|corrugated|folded|glued|bonded)\b/i.test(sentence);let score=3+titleOverlap*2+(sourceSpecific?2:0)+(processSyntax?2:0)+(strongTransformation?3:0);if(definitionNoise.test(sentence))score-=5;if(new RegExp(`converting[^.]{0,100}into\\s+${escaped}s?\\b`,`i`).test(sentence))score-=5;if(score<4)continue;candidates.push({title:action,category,process_term:match[0].toLowerCase(),rank,quote:snippet,source_id:document.source_id,source_title:document.title,score});break;}}}
  const chosen=[];for(const item of candidates.sort((a,b)=>a.rank-b.rank||b.score-a.score)){if(!chosen.some(existing=>existing.title===item.title))chosen.push(item);}
  return chosen;
}

function tokensForMatch(value){return String(value||"").toLowerCase().match(/[a-z0-9]+/g)?.filter(token=>token.length>2&&!new Set(["the","and","for","with","from","product","factory","plant","manufacturing"]).has(token))||[];}

function topicsFor(title){return TOPICS[title]||["worker conditions","community impacts","responsible sourcing"];}

module.exports={PROCESS_TERMS,actionTitle,decodeEntities,extractMaterials,extractProcessEvidence,htmlText,parseCsv,parseDocument,parseXlsx,parseZip,printablePdfText,quote,sentences,topicsFor,xmlValues};
