"use strict";

const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const AdmZip=require("adm-zip");
const {extractProcessEvidence,parseDocument,quote}=require("../research/document-parser");
const {resolveProduct}=require("../research/product-resolver");
const {wikipediaSearch}=require("../research/discovery");
const {searchableArtifactText}=require("../warehouse/dataset-ingestion");

test("document parsers make open HTML, JSON, CSV, XML, and PDF evidence searchable",()=>{
  assert.match(parseDocument(Buffer.from("<p>Ceramic tile clay is ground and pressed.</p>"),"text/html").text,/ground and pressed/);
  assert.match(parseDocument(Buffer.from(JSON.stringify({product:"sugar",step:"crystallisation"})),"application/json").text,/crystallisation/);
  assert.equal(parseDocument(Buffer.from("stage,input\nMilling,sugar beet"),"text/csv").rows[0].stage,"Milling");
  assert.match(parseDocument(Buffer.from("<root><step>Copper flotation</step></root>"),"application/xml").text,/Copper flotation/);
  assert.match(parseDocument(Buffer.from("BT (Paper recycling) Tj ET"),"application/pdf").text,/Paper recycling/);
});

test("XLSX and ZIP evidence archives are expanded without an external service",()=>{
  const xlsx=new AdmZip();xlsx.addFile("xl/sharedStrings.xml",Buffer.from("<sst><si><t>stage</t></si><si><t>input</t></si><si><t>Firing</t></si><si><t>Clay</t></si></sst>"));xlsx.addFile("xl/worksheets/sheet1.xml",Buffer.from('<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c t="s"><v>3</v></c></row></sheetData></worksheet>'));
  const workbook=parseDocument(xlsx.toBuffer(),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","evidence.xlsx");assert.equal(workbook.rows[0].stage,"Firing");assert.equal(workbook.rows[0].input,"Clay");
  const zip=new AdmZip();zip.addFile("process.csv",Buffer.from("stage,input\nPressing,Clay"));const archive=parseDocument(zip.toBuffer(),"application/zip","evidence.zip");assert.match(archive.text,/Pressing/);assert.equal(archive.entries[0].format,"csv");
});

test("product process extraction stays tied to the requested product",()=>{
  const documents=[{source_id:"sugar-source",title:"Sugar production",text:[
    "Sugar production starts when sugar beet is harvested for processing at the factory.",
    "Sugar beet is washed before the material is sent into the extraction process.",
    "Sugar juice is concentrated during the next production stage.",
    "Sugar crystals are refined before the final product is dried and packaged.",
    "Coffee beans are roasted and ground for coffee production."
  ].join(" ")}];
  const stages=extractProcessEvidence(documents,"sugar"),text=JSON.stringify(stages);
  assert.ok(stages.length>=3);assert.match(text,/Harvesting|Washing|Concentration|Refining/);assert.doesNotMatch(text,/Coffee|Roasting/);
});

test("retrieved evidence quotes always fit the research schema",()=>{
  const verbose=Array.from({length:28},(_,index)=>`electrochemical-characterisation-${index}`).join(" ");
  const clipped=quote(verbose);
  assert.ok(clipped.length<=240);
  assert.ok(clipped.length>=6);
  assert.equal(verbose.startsWith(clipped),true);
});

test("multiword discovery rejects adjacent pages that do not match the full product",async()=>{
  const pages=[
    {title:"Vitrified tile",key:"Vitrified_tile",excerpt:"A ceramic tile manufactured by pressing clay and firing it."},
    {title:"Porcelain tile",key:"Porcelain_tile",excerpt:"A ceramic tile manufacturing process."},
    {title:"Ceramic armor",key:"Ceramic_armor",excerpt:"Ceramic protective armor for vehicles."}
  ];
  const fetchImpl=async()=>new Response(JSON.stringify({pages}),{status:200,headers:{"content-type":"application/json"}});
  const results=await wikipediaSearch("ceramic tile",{fetchImpl,cacheMs:0});
  assert.deepEqual(results.map(item=>item.title),["Vitrified tile","Porcelain tile"]);
});

test("Wikidata enriches identity without replacing the user's exact product",async()=>{
  const fetchImpl=async()=>new Response(JSON.stringify({search:[{id:"Q188075",label:"box",description:"container",match:{}}]}),{status:200,headers:{"content-type":"application/json"}});
  const result=await resolveProduct({product:"corrugated paper box",prompt:"Corrugated paper box factory"},{},{fetchImpl,cacheMs:0});
  assert.equal(result.identity.requested_product,"corrugated paper box");assert.equal(result.identity.resolved_product,"corrugated paper box");
});

test("OpenAlex abstract records are reconstructed for exact evidence-quote verification",()=>{
  const bytes=Buffer.from(JSON.stringify({display_name:"Worker safety study",abstract_inverted_index:{Worker:[0],safety:[1],improved:[2],after:[3],controls:[4]}}));
  assert.equal(searchableArtifactText(bytes,"application/json").includes("Worker safety improved after controls"),true);
});

test("runtime has no paid AI gateway or card requirement",()=>{
  const root=path.join(__dirname,"..",".."),files=["package.json","api/evidence-report.js","api/evidence-jobs.js","evidence_engine/research/index.js","evidence_engine/research/discovery.js","sycle-platform.html"];
  const runtime=files.map(file=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
  assert.doesNotMatch(runtime,/AI_GATEWAY|Vercel AI Gateway|credit card|@ai-sdk|perplexity|tavily|anthropic/i);
  assert.match(runtime,/api\/evidence-jobs/);assert.match(runtime,/w\/rest\.php\/v1\/search\/page/);
});
