"use strict";

// The fact library: everything discovery verifies is saved so the next report asks the web nothing.
// Misses are saved too (short expiry) so a failed search is not repeated for every user.

const {stableId}=require("../warehouse/client");

const DAY=86400000;
const addDays=(iso,days)=>new Date(Date.parse(iso)+days*DAY).toISOString();

function createMemoryLibrary(){
  const facts=new Map(),hosts=new Map(),reviews=[];
  return {
    kind:"memory",facts,hosts,reviews,
    async lookup(questionKey,now=new Date().toISOString()){return [...facts.values()].filter(row=>row.question_key===questionKey&&row.expires_at>now);},
    async save(rows){for(const row of rows)facts.set(row.id,row);},
    async getHost(host){return hosts.get(host)||null;},
    async noteHost(record){const prior=hosts.get(record.host);hosts.set(record.host,{...prior,...record,times_used:(prior?.times_used||0)+(record.used?1:0),first_seen:prior?.first_seen||record.last_seen});},
    async queueReview(item){reviews.push(item);}
  };
}

function createSupabaseLibrary(client){
  const enc=encodeURIComponent;
  return {
    kind:"supabase",
    async lookup(questionKey,now=new Date().toISOString()){
      const rows=await client.request(`sycle_discovered_facts?select=*&question_key=eq.${enc(questionKey)}&expires_at=gt.${enc(now)}&limit=20`);
      return (rows||[]).map(row=>({...row,metadata:row.metadata||{}}));
    },
    async save(rows){await client.upsert("sycle_discovered_facts",rows);},
    async getHost(host){const rows=await client.request(`sycle_source_registry?select=*&id=eq.${enc(host)}&limit=1`);const row=rows?.[0];return row?{host:row.id,class:row.class,trust_score:Number(row.trust_score),reason:row.reason,review_status:row.review_status,times_used:Number(row.times_used||0)}:null;},
    // A host already in the registry keeps its class and review status; only usage and last_seen move.
    async noteHost(record){
      const prior=await this.getHost(record.host);
      const row=prior
        ?{id:record.host,class:prior.class,trust_score:prior.trust_score,reason:prior.reason,review_status:prior.review_status,times_used:prior.times_used+(record.used?1:0),last_seen:record.last_seen}
        :{id:record.host,class:record.class,trust_score:record.trust_score,reason:record.reason,assigned_by:record.assigned_by||"rule",review_status:record.review_status||"auto",times_used:record.used?1:0,last_seen:record.last_seen};
      await client.upsert("sycle_source_registry",[row]);
    },
    async queueReview(item){await client.upsert("sycle_review_queue",[{id:stableId("review",JSON.stringify(item)),kind:item.kind,payload:item,reason:item.reason,status:"open"}]);}
  };
}

function createLibrary(client){return client?createSupabaseLibrary(client):createMemoryLibrary();}

const factRow=({questionKey,question,level,fact,trust,document,now,status,ttlDays})=>({
  id:stableId("fact",`${questionKey}:${document.url}:${fact.quote}`),
  question_key:questionKey,indicator_id:question.indicator_id,kind:question.kind,ladder_level:level.id,proxy:level.proxy,
  geography:fact.geography,geography_level:level.schema_level,observation_year:fact.year,
  value:fact.value,value_text:fact.value_text,unit:fact.unit,evidence_quote:fact.quote,locator:fact.locator,
  source_url:document.url,source_title:document.title||null,publisher:trust.publisher||trust.host,source_class:trust.class,
  trust_score:trust.score,trust_reason:trust.reason,page_checksum:document.checksum,retrieved_at:now,expires_at:addDays(now,ttlDays),
  status,metadata:{year_verified:fact.year_verified,scope:fact.scope,method:fact.method||"model",needs_review:Boolean(trust.needs_review),corroboration_required:Boolean(trust.corroborate)}
});

const missRow=({questionKey,question,level,now,ttlDays,note})=>({
  id:stableId("miss",`${questionKey}:${now.slice(0,10)}`),question_key:questionKey,indicator_id:question.indicator_id,kind:question.kind,
  ladder_level:level.id,proxy:level.proxy,geography:question.place.label,geography_level:level.schema_level,observation_year:null,
  value:null,value_text:null,unit:"",evidence_quote:"",locator:"",source_url:"",source_title:null,publisher:null,source_class:"none",
  trust_score:0,trust_reason:note||"No verified source found at this level",page_checksum:"",retrieved_at:now,expires_at:addDays(now,ttlDays),status:"miss",metadata:{}
});

module.exports={DAY,addDays,createLibrary,createMemoryLibrary,createSupabaseLibrary,factRow,missRow};
