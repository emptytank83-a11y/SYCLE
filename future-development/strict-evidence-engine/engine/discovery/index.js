"use strict";

// Global evidence discovery. For every stage x stakeholder topic it asks one precise question, walks a fallback
// ladder (library first, then the web), keeps only facts whose quote and number appear on the fetched page, and
// saves every result so the next report reuses it. No country-specific code: places are inputs, not branches.

const {stableId}=require("../warehouse/client");
const {LEVELS,benchmarkQueriesFor,buildQuestions,effectiveLevel,levelsFor,queriesFor}=require("./questions");
const {classifySource,sourceTypeFor}=require("./trust");
const crypto=require("node:crypto");
const {extractFacts}=require("./extract");
const {extractLocal}=require("./extract-local");
const {addDays,factRow,missRow}=require("./library");
const {gradeFor,referenceScore,unitKey}=require("./score");

const DEFAULTS=Object.freeze({maxQuestions:30,maxSearches:80,maxFetches:100,maxJudgements:15,maxMs:200000,resultsPerQuery:6,docsPerLevel:4,concurrency:3,factTtlDays:365,newsTtlDays:30,missTtlDays:14});
const slug=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

function createBudget(limits){
  const cap={searches:limits.maxSearches,fetches:limits.maxFetches,judgements:limits.maxJudgements},used={searches:0,fetches:0,judgements:0},started=Date.now();
  // The time cap keeps the whole job inside the serverless function limit; unanswered questions become gaps.
  return {used,take(kind){if(used[kind]>=cap[kind]||Date.now()-started>limits.maxMs)return false;used[kind]++;return true;}};
}

async function mapPool(items,limit,fn){
  const out=new Array(items.length);let next=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next++;out[index]=await fn(items[index],index);}}));
  return out;
}

function placeKey(question,level){
  const {place,product,sector}=question;
  if(level.id==="exact")return `${place.country_code}|${slug(place.region)}|${slug(product)}`;
  if(level.id==="sector_country")return `${place.country_code}|${slug(sector)}`;
  if(level.id==="country")return place.country_code||slug(place.country);
  return "global";
}
const questionKey=(question,level)=>`${question.kind}:${question.indicator_id}:${placeKey(question,level)}:${level.id}`;

// Two verified sources that state clearly different values for the same year are both kept and flagged.
function markConflicts(rows){
  const numeric=rows.filter(row=>Number.isFinite(row.value));
  for(const a of numeric)for(const b of numeric){
    if(a===b||a.source_url===b.source_url||unitKey(a.unit)!==unitKey(b.unit))continue;
    const sameYear=a.observation_year===null||b.observation_year===null||a.observation_year===b.observation_year;
    const high=Math.max(Math.abs(a.value),Math.abs(b.value)),low=Math.min(Math.abs(a.value),Math.abs(b.value));
    if(sameYear&&high>0&&(high-low)/high>.05){a.status="conflict";b.status="conflict";}
  }
  return rows;
}

function pickPrimary(rows,targetYear){
  const usable=rows.filter(row=>row.status==="verified"||row.status==="conflict");
  const band=row=>row.trust_score>=90?1:0,distance=row=>row.observation_year===null?99:targetYear?Math.abs(targetYear-row.observation_year):-row.observation_year;
  const ranked=[...usable].sort((a,b)=>band(b)-band(a)||distance(a)-distance(b)||b.trust_score-a.trust_score);
  return {primary:ranked[0]||null,alternatives:ranked.slice(1,3),conflict:usable.some(row=>row.status==="conflict")};
}

async function searchLevel(question,level,ctx){
  const {search,llm,fetcher,library,budget,options,now,connectors}=ctx;
  const build=question.kind==="benchmark"?benchmarkQueriesFor:queriesFor;
  const judge=llm?async(url,context)=>budget.take("judgements")?llm.judge(url,context):null:null;

  // Official open-data APIs first: exact published values for almost every country, no account needed.
  async function direct(){
    const found=await (connectors?connectors.answer(question,level).catch(()=>[]):[]);
    const rows=[];
    for(const item of found){
      item.fact.method="open_api";
      rows.push(factRow({questionKey:questionKey(question,level),question,level:effectiveLevel(level,item.fact.scope),fact:item.fact,trust:item.trust,document:item.document,now,status:"verified",ttlDays:options.factTtlDays}));
      await library.noteHost({host:item.trust.host,class:item.trust.class,trust_score:item.trust.score,reason:item.trust.reason,assigned_by:"connector",last_seen:now,used:true});
    }
    return rows;
  }

  async function run(queries){
    const candidates=new Map();
    for(const query of queries){
      if(!budget.take("searches"))break;
      const results=await search(query,{count:options.resultsPerQuery}).catch(()=>[]);
      for(const result of results){
        if(!result?.url||candidates.has(result.url))continue;
        const trust=await classifySource(result.url,{title:result.title,snippet:result.snippet},{judge,registry:library});
        if(trust.source==="judge")await library.noteHost({host:trust.host,class:trust.class,trust_score:trust.score,reason:trust.reason,assigned_by:"judge",review_status:trust.needs_review?"pending_review":"auto",last_seen:now,used:false});
        if(trust.usable)candidates.set(result.url,{url:result.url,title:result.title,trust,text:result.text||null});
      }
    }
    const ranked=[...candidates.values()].sort((a,b)=>b.trust.score-a.trust.score).slice(0,options.docsPerLevel);
    const rows=[],strongHosts=new Set();
    for(const candidate of ranked){
      if(strongHosts.size>=2)break;
      if(rows.length&&candidate.trust.score<90)continue;
      if(!budget.take("fetches"))break;
      const document=candidate.text
        ?{ok:true,url:candidate.url,text:candidate.text,checksum:crypto.createHash("sha256").update(candidate.text).digest("hex"),retrieved_at:now}
        :await fetcher.fetchDocument(candidate.url);
      if(!document.ok)continue;
      document.title=candidate.title;
      const {accepted}=llm?await extractFacts({question,document,llm}):extractLocal({question,document,trust:candidate.trust});
      if(!accepted.length)continue;
      for(const fact of accepted){
        rows.push(factRow({questionKey:questionKey(question,level),question,level:effectiveLevel(level,fact.scope),fact,trust:candidate.trust,document,now,status:"verified",ttlDays:candidate.trust.class==="news"?options.newsTtlDays:options.factTtlDays}));
      }
      if(candidate.trust.score>=90)strongHosts.add(candidate.trust.host);
      await library.noteHost({host:candidate.trust.host,class:candidate.trust.class,trust_score:candidate.trust.score,reason:candidate.trust.reason,assigned_by:candidate.trust.source,last_seen:now,used:true});
    }
    return rows;
  }

  const viaApi=await direct();
  if(viaApi.length)return markConflicts(viaApi);
  if(!search)return [];
  const queries=build(question,level);
  let rows=await run(queries);
  if(!rows.length&&llm?.translate&&level.id!=="international"&&budget.take("judgements")){
    const local=await llm.translate(queries,question.place.country).catch(()=>queries);
    const fresh=local.filter((text,index)=>text&&text!==queries[index]);
    if(fresh.length)rows=await run(fresh);
  }
  return markConflicts(rows);
}

async function answerQuestion(question,ctx){
  const {library,options,now}=ctx,tried=[];
  for(const level of levelsFor(question)){
    const key=questionKey(question,level),stored=await library.lookup(key,now);
    const hits=stored.filter(row=>row.status==="verified"||row.status==="conflict");
    if(hits.length)return {question,level,rows:hits,cached:true,tried,...pickPrimary(hits,question.year)};
    if(stored.some(row=>row.status==="miss")){tried.push({level:level.id,result:"cached_miss"});continue;}
    if(!ctx.search&&!ctx.connectors){tried.push({level:level.id,result:"web_unavailable"});continue;}
    const rows=await searchLevel(question,level,ctx);
    if(rows.length){await library.save(rows);return {question,level,rows,cached:false,tried,...pickPrimary(rows,question.year)};}
    await library.save([missRow({questionKey:key,question,level,now,ttlDays:options.missTtlDays})]);
    tried.push({level:level.id,result:"not_found"});
  }
  return {question,level:null,rows:[],cached:false,tried,primary:null,alternatives:[],conflict:false};
}

const confidenceFor=grade=>grade==="A"?"H":grade==="D"?"L":"M";

function toOutputs(answers,now){
  const sources=new Map(),measurements=[],claims=[],gaps=[],review=[],scores=[],pairs=new Map();
  const sourceFor=row=>{
    const id=stableId("src",row.source_url);
    if(!sources.has(row.source_url))sources.set(row.source_url,{id,title:String(row.source_title||row.publisher||row.source_url).padEnd(4," ").slice(0,300),publisher:String(row.publisher||"Unknown publisher").padEnd(2," ").slice(0,200),url:row.source_url,dataset_url:null,publication_year:row.observation_year,source_type:sourceTypeFor(row.source_class),licence_name:null,licence_url:null,complete_dataset_available:false,authority_reason:String(row.trust_reason).padEnd(8,".").slice(0,300)});
    return id;
  };
  for(const answer of answers){
    const {question,level,primary,alternatives,conflict}=answer;
    if(!primary){gaps.push({indicator_id:question.indicator_id,kind:question.kind,stakeholder:question.stakeholder,subcategory:question.subcategory,stage_ids:question.stage_ids,question:question.text,tried:answer.tried,reason:"No source passing trust and quote checks was found at any ladder level; the report records this as a gap, not as low risk."});continue;}
    if(conflict)review.push({kind:"conflicting_sources",reason:"Verified sources disagree; both figures are shown",indicator_id:question.indicator_id,sources:[primary,...alternatives].map(row=>({url:row.source_url,value:row.value,year:row.observation_year}))});
    for(const row of [primary,...(conflict?alternatives:[])]){
      const isPrimary=row===primary,sourceId=sourceFor(row),rowLevel=LEVELS.find(item=>item.id===row.ladder_level)||level,grade=gradeFor({level:rowLevel,trust:row.trust_score,year:row.observation_year});
      const proxyNote=rowLevel.proxy?`Proxy at ${rowLevel.label} level. `:"";
      const id=`${question.indicator_id}${question.kind==="benchmark"?":benchmark":""}`;
      // Sentence matching can misread context, so rule-extracted web facts never reach high confidence.
      const base={id:stableId("m",`${row.id}`),source_id:sourceId,evidence_quote:row.evidence_quote,locator:row.locator,confidence:row.metadata?.method==="rule"&&confidenceFor(grade)==="H"?"M":confidenceFor(grade)};
      if(row.metadata?.needs_review||row.trust_score<60)review.push({kind:"low_trust_source",reason:row.trust_reason,url:row.source_url,indicator_id:question.indicator_id});
      if(Number.isFinite(row.value)){
        measurements.push({...base,indicator_id:isPrimary?id:`${id}:alt`,indicator_name:question.kind==="benchmark"?`${question.indicator.name} benchmark`:question.indicator.name,value:row.value,value_text:row.value_text,unit:row.unit||question.indicator.unit,geography:row.geography,geography_level:row.geography_level,year:row.observation_year,interpretation:`${proxyNote}${row.trust_reason}. Found for: ${question.text}`.slice(0,500),
          context:{stakeholder:question.stakeholder,subcategory:question.subcategory,stage_ids:question.stage_ids,direction:question.indicator.direction,kind:question.kind,ladder_level:rowLevel.id,proxy:rowLevel.proxy,trust_score:row.trust_score,grade,discovery_verified:true,cached:answer.cached}});
        if(isPrimary)pairs.set(`${question.indicator_id}:${question.kind}`,{measurement:measurements.at(-1),question,level:rowLevel,grade});
      }else{
        claims.push({id:stableId("c",row.id),statement:`${question.indicator.name} (${row.geography}): ${row.value_text}`.slice(0,400).padEnd(12," "),claim_type:question.indicator.unit==="qualitative"?"regulation":"social_risk",source_ids:[sourceId],evidence_quote:row.evidence_quote,locator:row.locator,geography:row.geography,publication_year:row.observation_year,confidence:base.confidence,stakeholder:question.stakeholder,risk_level:null,context:{discovery_verified:true,kind:question.kind,ladder_level:rowLevel.id,proxy:rowLevel.proxy}});
      }
    }
  }
  for(const [key,entry] of pairs){
    if(!key.endsWith(":indicator"))continue;
    const bench=pairs.get(key.replace(/:indicator$/,":benchmark")),{measurement,question}=entry;
    const sameSeries=bench&&bench.measurement.source_id===measurement.source_id&&bench.measurement.value===measurement.value&&bench.measurement.year===measurement.year;
    const result=sameSeries?{score:null,reason:"The benchmark is the same series as the value; not compared"}:bench?referenceScore({value:measurement.value,benchmark:bench.measurement.value,direction:question.indicator.direction,unit:measurement.unit,benchmarkUnit:bench.measurement.unit}):{score:null,reason:"No verified benchmark was found"};
    scores.push({indicator_id:question.indicator_id,stakeholder:question.stakeholder,subcategory:question.subcategory,stage_ids:question.stage_ids,value:measurement.value,unit:measurement.unit,benchmark_value:bench?.measurement.value??null,benchmark_unit:bench?.measurement.unit??null,quality_grade:entry.grade,proxy:entry.level.proxy,level:entry.level.id,measurement_id:measurement.id,benchmark_measurement_id:bench?.measurement.id??null,...result});
  }
  return {sources:[...sources.values()],measurements,claims,scores,gaps,review};
}

async function researchEvidence({intake,stages},deps={},options={}){
  const opts={...DEFAULTS,...options},now=(deps.now||new Date()).toISOString?.()||new Date().toISOString();
  const library=deps.library;
  const ctx={search:deps.search,llm:deps.llm,fetcher:deps.fetcher,connectors:deps.connectors,library,budget:createBudget(opts),options:opts,now};
  const questions=buildQuestions({intake,stages},{maxQuestions:opts.maxQuestions});
  // Indicator questions first so the most important evidence is found before the budget runs out.
  const ordered=[...questions.filter(q=>q.kind==="indicator"),...questions.filter(q=>q.kind==="benchmark")];
  let done=0;
  const answers=await mapPool(ordered,opts.concurrency,async question=>{
    const answer=await answerQuestion(question,ctx);
    done++;if(deps.onProgress)await deps.onProgress({done,total:ordered.length,indicator_id:question.indicator_id});
    return answer;
  });
  const outputs=toOutputs(answers,now);
  return {...outputs,stats:{configured:Boolean(ctx.search||ctx.connectors),model_assisted:Boolean(ctx.llm),questions:ordered.length,answered:answers.filter(a=>a.primary).length,from_library:answers.filter(a=>a.cached).length,gaps:outputs.gaps.length,...ctx.budget.used},answers:answers.map(a=>({id:a.question.id,level:a.level?.id||null,cached:a.cached,tried:a.tried}))};
}

module.exports={DEFAULTS,addDays,answerQuestion,markConflicts,pickPrimary,questionKey,researchEvidence,toOutputs};
