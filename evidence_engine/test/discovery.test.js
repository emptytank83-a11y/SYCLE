"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const {numbersIn,valueInQuote,verifyFact}=require("../discovery/verify");
const {classifyByRule,classifySource}=require("../discovery/trust");
const {parseRobots,robotsAllows}=require("../discovery/fetcher");
const {buildQuestions}=require("../discovery/questions");
const {referenceScore}=require("../discovery/score");
const {createMemoryLibrary}=require("../discovery/library");
const {researchEvidence}=require("../discovery");

const PAGE="The statistics bureau reports that in 2022 the fatal occupational injury rate was 3.4 per 100,000 workers across the economy. Wages rose 4% in 2023.";

test("number matching never turns 1.5 into 15 and understands local separators",()=>{
  assert.ok(!numbersIn("rate of 1.5 per 100").includes(15));
  assert.ok(numbersIn("1,234.5").includes(1234.5));
  assert.ok(numbersIn("1.234,5").includes(1234.5));
  assert.ok(numbersIn("1 234").includes(1234));
  assert.ok(numbersIn("12,5 %").includes(12.5));
  assert.ok(valueInQuote(3.4,"rate was 3.4 per 100,000 workers"));
  assert.ok(!valueInQuote(34,"rate was 3.4 per 100,000 workers"));
});

test("a fact is accepted only when its quote is on the page and its number is in the quote",()=>{
  const good={value:3.4,unit:"per 100,000 workers",year:2022,quote:"in 2022 the fatal occupational injury rate was 3.4 per 100,000 workers"};
  assert.deepEqual(verifyFact(good,PAGE),{ok:true,reasons:[],year:2022,year_verified:true});
  assert.deepEqual(verifyFact({...good,quote:"the fatal injury rate fell to 1.1 per 100,000 workers last year"},PAGE).reasons,["quote_not_on_page"]);
  assert.deepEqual(verifyFact({...good,value:9.9},PAGE).reasons,["number_not_in_quote"]);
  assert.deepEqual(verifyFact({...good,unit:""},PAGE).reasons,["missing_unit"]);
  assert.equal(verifyFact({...good,year:2019},PAGE).year,null,"an unsupported year is dropped, not trusted");
  assert.ok(!verifyFact({value:null,value_text:null,unit:"x",quote:good.quote},PAGE).ok);
});

test("source trust is rule-based and global, with model judgement capped and flagged",async()=>{
  for(const url of ["https://www.ibge.gov.br/x","https://www.stat.go.jp/x","https://www.inegi.gob.mx/x","https://www.insee.gouv.fr/x","https://www.ons.gov.uk/x","https://www.bfs.admin.ch/x","https://www.dst.gov.dk/x"])
    assert.equal(classifyByRule(url).class,"government",url);
  assert.equal(classifyByRule("https://ilostat.ilo.org/data").class,"intergovernmental");
  assert.equal(classifyByRule("https://myblog.blogspot.com/post").usable,false);
  assert.equal(classifyByRule("https://en.wikipedia.org/wiki/Sugar").usable,false);
  assert.equal(classifyByRule("https://www.destatis.de/x").class,"unverified");
  const judged=await classifySource("https://www.destatis.de/x",{},{judge:async()=>({class:"government",publisher:"Destatis",reason:"Germany's federal statistical office"})});
  assert.equal(judged.class,"government");assert.ok(judged.score<=85&&judged.needs_review,"model-assigned trust is capped below rule-verified government");
  const forged=await classifySource("https://random.example/x",{},{judge:async()=>({class:"made_up",reason:"x"})});
  assert.equal(forged.class,"unverified");
});

test("robots.txt rules are obeyed",()=>{
  const rules=parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/open\n");
  assert.ok(!robotsAllows(rules,"/private/data"));assert.ok(robotsAllows(rules,"/private/open/x"));assert.ok(robotsAllows(rules,"/public"));
  assert.ok(!robotsAllows(parseRobots("User-agent: SYCLEBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n"),"/anything"));
});

const stages=[
  {id:"stage-1",foreground:false,social_risks:["machinery safety"]},
  {id:"stage-2",foreground:true,social_risks:["machinery safety","wages and working hours"]}
];
const intakeFor=(country,code,region)=>({product:"sugar",industry:"Sugar production",country,country_code:code,region,locality:null,timeframe:"2022"});

test("questions are built from stages for any country, deduplicated, with a benchmark twin",()=>{
  const questions=buildQuestions({intake:intakeFor("Vietnam","VNM","Long An"),stages});
  const injury=questions.filter(q=>q.indicator_id==="occupational_fatal_injury_rate");
  assert.equal(injury.length,2);assert.deepEqual(injury.map(q=>q.kind).sort(),["benchmark","indicator"]);
  assert.deepEqual(injury[0].stage_ids.sort(),["stage-1","stage-2"]);
  assert.match(injury.find(q=>q.kind==="indicator").text,/Long An, Vietnam in 2022/);
  for(const stakeholder of ["workers","local_communities","society","consumers","value_chain_actors","children"])assert.ok(questions.some(q=>q.stakeholder===stakeholder),`covers ${stakeholder}`);
});

test("reference scoring is explicit and refuses mismatched units",()=>{
  assert.equal(referenceScore({value:3.4,benchmark:4,direction:"lower_is_better",unit:"per 100,000 workers",benchmarkUnit:"per 100,000 workers"}).score,1);
  assert.equal(referenceScore({value:10,benchmark:4,direction:"lower_is_better",unit:"%",benchmarkUnit:"%"}).score,-2);
  assert.equal(referenceScore({value:52,benchmark:50,direction:"higher_is_better",unit:"score",benchmarkUnit:"score"}).score,0);
  assert.equal(referenceScore({value:3.4,benchmark:4,direction:"lower_is_better",unit:"%",benchmarkUnit:"per 100,000 workers"}).score,null);
});

// A fake internet: pages are found by tag words in the query; the "model" returns the planned fact for each page.
function fakeWorld(pages){
  const calls={search:0,fetch:0,llm:0};
  const search=async query=>{calls.search++;const q=query.toLowerCase();return Object.entries(pages).filter(([,page])=>page.tags.every(tag=>q.includes(tag))).map(([url,page])=>({title:page.title||"Report",url,snippet:""}));};
  const fetcher={fetchDocument:async url=>{calls.fetch++;return pages[url]?{ok:true,url,text:pages[url].text,checksum:`sum-${url}`,retrieved_at:"2026-10-12T00:00:00Z"}:{ok:false,url,error:"http_404"};}};
  const llm={
    json:async({system,user})=>{calls.llm++;if(!/extract facts/.test(system))return {};const url=/Page URL: (\S+)/.exec(user)[1];return {facts:pages[url]?.facts||[]};},
    translate:async queries=>queries,judge:async()=>null
  };
  return {search,fetcher,llm,calls};
}
const injuryFact=(quote,value,year=2022)=>({value,value_text:null,unit:"per 100,000 workers",year,geography:"Country",scope:"country",quote,locator:"para 1"});

test("the same code answers Brazil and Vietnam, falls back down the ladder, and labels proxies",async()=>{
  for(const [country,code,host] of [["Brazil","BRA","www.ibge.gov.br"],["Vietnam","VNM","www.gso.gov.vn"]]){
    const lower=country.toLowerCase(),url=`https://${host}/safety`,benchUrl=`https://ilostat.ilo.org/${lower}-benchmark`;
    const quote=`the fatal occupational injury rate was 3.4 per 100,000 workers in ${country}`,benchQuote="the all-industry average fatal occupational injury rate was 4.0 per 100,000 workers";
    const world=fakeWorld({
      [url]:{tags:[lower,"ministry"],text:`Official bulletin: ${quote} in 2022.`,facts:[injuryFact(quote,3.4)]},
      [benchUrl]:{tags:[lower,"all-industry"],text:`ILO table: ${benchQuote} in 2022.`,facts:[injuryFact(benchQuote,4.0)]}
    });
    const library=createMemoryLibrary();
    const result=await researchEvidence({intake:intakeFor(country,code,"Region"),stages},{...world,library,now:new Date("2026-10-12T00:00:00Z")},{maxQuestions:6});
    const injury=result.measurements.find(m=>m.indicator_id==="occupational_fatal_injury_rate");
    assert.ok(injury,`${country}: injury rate found`);
    assert.equal(injury.value,3.4);assert.equal(injury.context.ladder_level,"country");assert.equal(injury.context.proxy,true);
    assert.match(injury.interpretation,/^Proxy at country overall level/);
    assert.equal(injury.year,2022);assert.deepEqual(injury.context.stage_ids.sort(),["stage-1","stage-2"]);
    const score=result.scores.find(s=>s.indicator_id==="occupational_fatal_injury_rate");
    assert.equal(score.score,1);assert.ok(score.benchmark_measurement_id);
    assert.ok(result.sources.some(s=>s.url===url&&s.source_type==="official_document"));
    assert.ok(result.gaps.some(g=>g.indicator_id==="minimum_wage_level"),"unanswered topics become explicit gaps");
    assert.ok(result.review.length===0);

    // Second user, same question: everything comes from the library, nothing is searched or fetched.
    const again=fakeWorld({});
    const reused=await researchEvidence({intake:intakeFor(country,code,"Region"),stages},{...again,library,now:new Date("2026-10-13T00:00:00Z")},{maxQuestions:6});
    assert.equal(again.calls.search,0);assert.equal(again.calls.fetch,0);
    assert.equal(reused.measurements.find(m=>m.indicator_id==="occupational_fatal_injury_rate").value,3.4);
    assert.ok(reused.stats.from_library>=2);
  }
});

test("invented facts are rejected and failed searches are remembered",async()=>{
  const url="https://stats.gov.xx/page";
  const world=fakeWorld({[url]:{tags:["freedonia","fatal"],text:"The page discusses workplace safety in general terms and mentions no figures at all here.",facts:[injuryFact("the fatal occupational injury rate was 99 per 100,000 workers",99)]}});
  const library=createMemoryLibrary();
  const deps={...world,library,now:new Date("2026-10-12T00:00:00Z")};
  const first=await researchEvidence({intake:intakeFor("Freedonia","FRE",null),stages},deps,{maxQuestions:2});
  assert.equal(first.measurements.length,0,"a quote that is not on the page never becomes evidence");
  assert.ok(first.gaps.some(g=>g.indicator_id==="occupational_fatal_injury_rate"));
  const searchesBefore=world.calls.search;
  await researchEvidence({intake:intakeFor("Freedonia","FRE",null),stages},deps,{maxQuestions:2});
  assert.equal(world.calls.search,searchesBefore,"cached misses stop repeat searching");
});

test("disagreeing verified sources are both kept and sent to review",async()=>{
  const a="https://stats.gov.aa/x",b="https://data.worldbank.org/y";
  const qa="the fatal occupational injury rate was 3.4 per 100,000 workers",qb="the fatal occupational injury rate was 6.8 per 100,000 workers";
  const world=fakeWorld({[a]:{tags:["utopia","fatal"],text:`Bulletin: ${qa} in 2022.`,facts:[injuryFact(qa,3.4)]},[b]:{tags:["utopia","fatal"],text:`Table: ${qb} in 2022.`,facts:[injuryFact(qb,6.8)]}});
  const result=await researchEvidence({intake:intakeFor("Utopia","UTO",null),stages},{...world,library:createMemoryLibrary(),now:new Date("2026-10-12T00:00:00Z")},{maxQuestions:2});
  const values=result.measurements.filter(m=>["occupational_fatal_injury_rate","occupational_fatal_injury_rate:alt"].includes(m.indicator_id)).map(m=>m.value).sort();
  assert.deepEqual(values,[3.4,6.8]);
  assert.ok(result.review.some(r=>r.kind==="conflicting_sources"));
});

test("spending stays inside the budget",async()=>{
  const world=fakeWorld({});
  await researchEvidence({intake:intakeFor("Nowhere","NWH",null),stages},{...world,library:createMemoryLibrary()},{maxSearches:5,maxFetches:2,maxQuestions:10});
  assert.ok(world.calls.search<=5);
});

test("a saved lifecycle never overwrites the current user's place, scale or period",()=>{
  const {overlayIntake}=require("../research");
  const plan={intake:{product:"sugar",country:"Brazil",country_code:"BRA",region:"Sao Paulo",locality:null,scale_value:5,scale_unit:"t",timeframe:"2020",boundary:"cradle_to_gate"}};
  overlayIntake(plan,{country:"Vietnam",countryCode:"VNM",region:"Long An",qty:1000,scaleUnit:"t/year",timeframe:"2026"},{system_boundary:"cradle_to_grave"});
  assert.deepEqual(plan.intake,{product:"sugar",country:"Vietnam",country_code:"VNM",region:"Long An",locality:null,scale_value:1000,scale_unit:"t/year",timeframe:"2026",boundary:"cradle_to_grave"});
});

test("the time budget stops new web work",async()=>{
  const world=fakeWorld({});
  await researchEvidence({intake:intakeFor("Nowhere","NWH",null),stages},{...world,library:createMemoryLibrary()},{maxMs:-1});
  assert.equal(world.calls.search,0);
});

// ---- keyless operation: open-data connectors + rule-based extraction, no search key, no model ----
const {createConnectors,parseCsv,sectionOf}=require("../discovery/connectors");
const {extractLocal}=require("../discovery/extract-local");
const {INDICATORS,LEVELS}=require("../discovery/questions");

const iloCsv=`\uFEFF"ref_area","source","indicator","classif1","time","obs_value","obs_status","note_classif","note_indicator","note_source"
"BRA","FA:1","INJ_FATL_ECO_RT","ECO_SECTOR_TOTAL","2011",7.433,,,"",
"BRA","FA:1","INJ_FATL_ECO_RT","ECO_AGGREGATE_MAN","2011",8.451,,,"",
"BRA","FA:1","INJ_FATL_ECO_RT","ECO_AGGREGATE_MAN","2009",9.9,,,"",
`;
const wb=(country,value,year=2022)=>JSON.stringify([{page:1},[{indicator:{id:"X",value:"Unemployment, total (% of total labor force) (modeled ILO estimate)"},country:{value:country},date:String(year),value}]]);
const fakeApis=async url=>{
  const u=String(url),ok=body=>new Response(body,{status:200});
  if(u.includes("rplumber.ilo.org"))return ok(iloCsv);
  if(u.includes("/country/BRA/"))return ok(wb("Brazil",9.231));
  if(u.includes("/country/WLD/"))return ok(wb("World",5.2346279));
  return new Response("",{status:404});
};
const brazil={country:"Brazil",country_code:"BRA",label:"Brazil"};
const level=id=>LEVELS.find(item=>item.id===id);

test("CSV parsing handles BOMs and quotes; ISIC maps to broad sectors",()=>{
  assert.equal(parseCsv(iloCsv).length,3);assert.equal(parseCsv(iloCsv)[1].obs_value,"8.451");
  assert.equal(sectionOf(["1072"]),"MAN");assert.equal(sectionOf(["0111"]),"AGR");assert.equal(sectionOf(["3511"]),"UTI");assert.equal(sectionOf([]),null);
});

test("open-data connectors return exact published values for any country code, and sector series when the product's sector is known",async()=>{
  const connectors=createConnectors({fetchImpl:fakeApis});
  const injury=INDICATORS["workers.health_and_safety"];
  const q=(kind,extra={})=>({kind,indicator_id:injury.id,indicator:injury,place:brazil,isic:["1072"],year:2022,...extra});
  const sector=await connectors.answer(q("indicator"),level("sector_country"));
  assert.equal(sector[0].fact.value,8.451);assert.equal(sector[0].fact.year,2011,"latest year at or before the target");assert.equal(sector[0].fact.scope,"sector");
  const total=await connectors.answer(q("benchmark"),level("country"));
  assert.equal(total[0].fact.value,7.433);
  assert.equal(sector[0].trust.class,"intergovernmental");assert.match(sector[0].document.text,/Brazil \(sector MAN\), 2011: 8.451 per 100,000 workers/);
  const unemployment=INDICATORS["workers.job_security"];
  const world=await connectors.answer({kind:"benchmark",indicator_id:unemployment.id,indicator:unemployment,place:brazil,isic:[],year:2022},level("international"));
  assert.equal(world[0].fact.value,5.235,"long decimals are rounded for display");
  assert.deepEqual(await connectors.answer({kind:"indicator",indicator_id:"no_such_indicator",indicator:unemployment,place:brazil,isic:[]},level("country")),[]);
  assert.deepEqual(await connectors.answer({kind:"indicator",indicator_id:injury.id,indicator:injury,place:{country:"X",country_code:null,label:"X"},isic:[]},level("country")),[]);
});

test("rule-based extraction accepts a precise sentence and rejects look-alikes",()=>{
  const question={kind:"indicator",indicator:INDICATORS["workers.health_and_safety"],place:{country:"Vietnam",label:"Vietnam"}};
  const trusted={score:96};
  const page="Occupational safety report. In Vietnam the fatal occupational injury rate reached 4.2 per 100,000 workers in 2021. Elsewhere, Germany reported 1.1 per 100,000 workers. Total sales were 55 in 2021.";
  const {accepted}=extractLocal({question,document:{text:page},trust:trusted});
  assert.equal(accepted.length,1);assert.equal(accepted[0].value,4.2);assert.equal(accepted[0].year,2021);assert.equal(accepted[0].method,"rule");
  assert.deepEqual(extractLocal({question:{...question,place:{country:"Peru",label:"Peru"}},document:{text:page},trust:trusted}).accepted,[],"a page that never names the place gives nothing");
  assert.deepEqual(extractLocal({question,document:{text:page},trust:{score:50}}).accepted,[],"low-trust sources are not read by rules");
  const wage={...question,indicator:INDICATORS["workers.fair_salary"]};
  assert.deepEqual(extractLocal({question:wage,document:{text:"Vietnam minimum wage is set by region and revised yearly, up to 13 in some cases."},trust:trusted}).accepted,[],"units rules cannot match reliably are skipped");
});

test("with no keys at all the engine answers from open data, and the second user needs no calls",async()=>{
  let calls=0;const counting=async url=>{calls++;return fakeApis(url);};
  const library=createMemoryLibrary();
  const deps={connectors:createConnectors({fetchImpl:counting}),library,search:null,llm:null,fetcher:{fetchDocument:async()=>({ok:false})},now:new Date("2026-10-12T00:00:00Z")};
  const intake={...intakeFor("Brazil","BRA","Sao Paulo"),classifications:{isic:["1072"]}};
  const first=await researchEvidence({intake,stages},deps,{maxQuestions:4});
  const injury=first.measurements.find(m=>m.indicator_id==="occupational_fatal_injury_rate");
  assert.equal(injury.value,8.451);assert.equal(injury.context.ladder_level,"sector_country");assert.equal(first.stats.model_assisted,false);
  const score=first.scores.find(s=>s.indicator_id==="occupational_fatal_injury_rate");
  assert.equal(score.benchmark_value,7.433);assert.equal(score.score,-1);
  const callsAfterFirst=calls;
  const second=await researchEvidence({intake,stages},deps,{maxQuestions:4});
  assert.equal(calls,callsAfterFirst,"saved facts are reused without calling any API");
  assert.ok(second.stats.from_library>=2);
});

test("a benchmark that is the same series as the value is not used to score it",async()=>{
  const connectors=createConnectors({fetchImpl:fakeApis});
  const library=createMemoryLibrary();
  const intake=intakeFor("Brazil","BRA","Sao Paulo");           // no ISIC: the value falls back to the all-sector total
  const result=await researchEvidence({intake,stages},{connectors,library,fetcher:{fetchDocument:async()=>({ok:false})}},{maxQuestions:2});
  const score=result.scores.find(s=>s.indicator_id==="occupational_fatal_injury_rate");
  assert.equal(score.score,null);assert.match(score.reason,/same series/);
});

test("a missing database table degrades to memory instead of failing the report",async()=>{
  const {createResilientLibrary}=require("../discovery/library");
  const client={request:async()=>{throw new Error('relation "sycle_discovered_facts" does not exist');},upsert:async()=>{throw new Error("no table");}};
  const library=createResilientLibrary(client);
  const world=fakeWorld({});
  const result=await researchEvidence({intake:intakeFor("Nowhere","NWH",null),stages},{...world,library},{maxQuestions:2});
  assert.equal(result.stats.questions,4);assert.match(library.state.degraded,/does not exist/);
  await library.save([{id:"x",question_key:"k",status:"verified",expires_at:"2999-01-01T00:00:00Z"}]);
  assert.equal((await library.lookup("k","2026-01-01T00:00:00Z")).length,1,"later saves still work from memory");
});
