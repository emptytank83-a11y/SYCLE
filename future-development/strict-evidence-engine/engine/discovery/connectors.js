"use strict";

// Keyless connectors to global open-data APIs (ILO, World Bank, WHO). They cover almost every country with one
// code path, return exact published values, and need no account. Each answer is rendered as a short text record so it
// passes through the same quote-and-number verification as any web page.

const crypto=require("node:crypto");
const countries=require("i18n-iso-countries");
const {verifyFact}=require("./verify");

const USER_AGENT="SYCLEBot/1.0 (+https://github.com/emptytank83-a11y/SYCLE; open-data research)";
const sha=value=>crypto.createHash("sha256").update(value).digest("hex");

const PUBLISHERS=Object.freeze({
  ilo:{host:"ilo.org",name:"International Labour Organization (ILOSTAT)"},
  worldbank:{host:"worldbank.org",name:"World Bank Open Data"},
  who:{host:"who.int",name:"World Health Organization (Global Health Observatory)"},
  sdg:{host:"un.org",name:"United Nations SDG Global Database"}
});

// ISIC Rev.4 division -> broad section used by the sector series.
function sectionOf(isicCodes=[]){
  for(const code of isicCodes){
    const division=Number(String(code).replace(/\D/g,"").padStart(4,"0").slice(0,2));
    if(division>=1&&division<=3)return "AGR";
    if(division>=5&&division<=9)return "MIN";
    if(division>=10&&division<=33)return "MAN";
    if(division>=35&&division<=39)return "UTI";
    if(division>=41&&division<=43)return "CON";
    if(division>=45)return "SER";
  }
  return null;
}
const WB_SECTOR_EMPLOYMENT={AGR:"SL.AGR.EMPL.ZS",MIN:"SL.IND.EMPL.ZS",MAN:"SL.IND.EMPL.ZS",UTI:"SL.IND.EMPL.ZS",CON:"SL.IND.EMPL.ZS",SER:"SL.SRV.EMPL.ZS"};

// One entry per indicator; unit and meaning come from the publisher's own dataset definition.
const SPECS=Object.freeze({
  occupational_fatal_injury_rate:{source:"ilo",dataset:"INJ_FATL_ECO_RT_A",label:"Fatal occupational injuries per 100,000 workers",unit:"per 100,000 workers",total:r=>r.classif1==="ECO_SECTOR_TOTAL",sector:(r,sec)=>r.classif1===`ECO_AGGREGATE_${sec}`,benchmark:"country_total"},
  minimum_wage_level:{source:"ilo",dataset:"EAR_INEE_CUR_NB_A",label:"Monthly statutory minimum wage",unit:"USD per month",total:r=>r.classif1==="CUR_TYPE_USD"},
  weekly_working_hours:{source:"ilo",dataset:"HOW_TEMP_SEX_NB_A",label:"Average weekly hours actually worked per employed person",unit:"hours per week",total:r=>r.sex==="SEX_T"},
  trade_union_density:{source:"ilo",dataset:"ILR_TUMT_NOC_RT_A",label:"Trade union density rate",unit:"% of employees",total:()=>true},
  gender_pay_gap:{source:"ilo",dataset:"EAR_GGAP_OCU_RT_A",label:"Gender wage gap",unit:"%",total:r=>r.classif1==="OCU_SKILL_TOTAL"},
  unemployment_rate:{source:"worldbank",code:"SL.UEM.TOTL.ZS",label:"Unemployment, total (modeled ILO estimate)",unit:"% of labour force",benchmark:"world"},
  local_unemployment_rate:{source:"worldbank",code:"SL.UEM.TOTL.ZS",label:"Unemployment, total (modeled ILO estimate)",unit:"% of labour force",benchmark:"world"},
  child_labour_prevalence:{source:"worldbank",code:"SL.TLF.0714.ZS",label:"Children in employment, total",unit:"% of children ages 7-14",benchmark:"world"},
  rd_expenditure:{source:"worldbank",code:"GB.XPD.RSDV.GD.ZS",label:"Research and development expenditure",unit:"% of GDP",benchmark:"world"},
  out_of_school_rate:{source:"worldbank",code:"SE.SEC.UNER.LO.ZS",label:"Children out of school, lower secondary school age",unit:"% of lower secondary school age",benchmark:"world"},
  sector_employment_share:{source:"worldbank",codeFor:sec=>WB_SECTOR_EMPLOYMENT[sec]||"SL.SRV.EMPL.ZS",label:"Employment in the sector",unit:"% of total employment",benchmark:"world",sectorLevel:true},
  recycling_rate:{source:"sdg",series:"EN_MWT_RCYR",dims:{},label:"Proportion of municipal waste recycled",unit:"% of municipal waste recycled",benchmark:"world"},
  ambient_air_pollution:{source:"who",code:"SDGPM25",label:"Annual mean concentration of fine particulate matter (PM2.5)",unit:"µg/m³",benchmark:"who_global"}
});

function parseCsv(text){
  const rows=[];let row=[],field="",quoted=false;
  const body=String(text).replace(/^﻿/,"");
  for(let i=0;i<body.length;i++){
    const ch=body[i];
    if(quoted){if(ch==='"'&&body[i+1]==='"'){field+='"';i++;}else if(ch==='"')quoted=false;else field+=ch;}
    else if(ch==='"')quoted=true;
    else if(ch===","){row.push(field);field="";}
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&body[i+1]==="\n")i++;row.push(field);field="";if(row.length>1||row[0])rows.push(row);row=[];}
    else field+=ch;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  const [header,...data]=rows;
  return header?data.map(values=>Object.fromEntries(header.map((name,index)=>[name,values[index]]))):[];
}

const pickObservation=(rows,targetYear)=>{
  const usable=rows.filter(r=>Number.isFinite(r.value)&&Number.isInteger(r.year));
  if(!usable.length)return null;
  const byYear=usable.sort((a,b)=>b.year-a.year);
  return (targetYear&&byYear.find(r=>r.year<=targetYear))||byYear[0];
};

function createConnectors({fetchImpl=fetch,timeoutMs=20000}={}){
  async function get(url,attempt=0){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(url,{signal:controller.signal,headers:{"user-agent":USER_AGENT,accept:"application/json, text/csv"}});
      if(response.ok)return await response.text();
      if(attempt<2&&(response.status===429||response.status>=500)){await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));return get(url,attempt+1);}
      return null;
    }catch{
      if(attempt<2){await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));return get(url,attempt+1);}
      return null;
    }finally{clearTimeout(timer);}
  }

  async function series(spec,code3,question,sector){
    if(spec.source==="ilo"){
      const url=`https://rplumber.ilo.org/data/indicator/?id=${spec.dataset}&ref_area=${code3}&format=.csv&timefrom=2000`;
      const body=await get(url);if(!body||body.startsWith("{"))return null;
      const raw=parseCsv(body).filter(r=>r.ref_area===code3);
      const toRow=r=>({value:Number(r.obs_value),year:Number(r.time)});
      const total=pickObservation(raw.filter(spec.total).map(toRow),question.year);
      const sectorRow=sector&&spec.sector?pickObservation(raw.filter(r=>spec.sector(r,sector)).map(toRow),question.year):null;
      return {url,body,total,sector:sectorRow,country:code3};
    }
    if(spec.source==="worldbank"){
      const code=spec.codeFor?spec.codeFor(sector):spec.code;
      const fetchOne=async area=>{
        const url=`https://api.worldbank.org/v2/country/${area}/indicator/${code}?format=json&date=2000:${question.year||new Date().getFullYear()}&per_page=60`;
        const body=await get(url);if(!body)return null;
        let data;try{data=JSON.parse(body);}catch{return null;}
        const rows=(Array.isArray(data?.[1])?data[1]:[]).map(r=>({value:r.value===null?NaN:Number(r.value),year:Number(r.date),name:r.country?.value,indicator:r.indicator?.value}));
        return {url,body,total:pickObservation(rows,question.year),country:rows[0]?.name||area,indicator:rows[0]?.indicator};
      };
      return {main:await fetchOne(code3),world:await fetchOne("WLD"),code};
    }
    if(spec.source==="sdg"){
      const fetchOne=async numeric=>{
        const url=`https://unstats.un.org/sdgapi/v1/sdg/Series/Data?seriesCode=${spec.series}&areaCode=${Number(numeric)}&pageSize=500`;
        const body=await get(url);if(!body)return null;
        let data;try{data=JSON.parse(body);}catch{return null;}
        const matches=(data?.data||[]).filter(r=>Object.entries(spec.dims).every(([key,value])=>r.dimensions?.[key]===value));
        const rows=matches.map(r=>({value:Number(r.value),year:Number(r.timePeriodStart),name:r.geoAreaName,indicator:r.seriesDescription}));
        return {url,body,total:pickObservation(rows,question.year),country:rows[0]?.name,indicator:rows[0]?.indicator};
      };
      const numeric=countries.alpha3ToNumeric(code3);
      return {main:numeric?await fetchOne(numeric):null,world:await fetchOne(1)};
    }
    if(spec.source==="who"){
      const fetchOne=async filter=>{
        const url=`https://ghoapi.azureedge.net/api/${spec.code}?$filter=${encodeURIComponent(filter)}`;
        const body=await get(url);if(!body)return null;
        let data;try{data=JSON.parse(body);}catch{return null;}
        const rows=(data?.value||[]).filter(r=>(r.Dim1||"").endsWith("_TOTL")||!r.Dim1).map(r=>({value:Number(r.NumericValue),year:Number(r.TimeDim)}));
        return {url,body,total:pickObservation(rows,question.year)};
      };
      return {main:await fetchOne(`SpatialDim eq '${code3}'`),world:await fetchOne("SpatialDimType eq 'GLOBAL'")};
    }
    return null;
  }

  function render({spec,publisher,label,place,observation:raw,url,body,scope,question,role}){
    const observation={...raw,value:Math.round(raw.value*1000)/1000};
    const quote=`${place}, ${observation.year}: ${observation.value} ${spec.unit}`;
    const text=`${publisher.name}. ${label}. ${quote}. Source: ${url}`;
    const fact={value:observation.value,value_text:null,unit:spec.unit,year:observation.year,year_verified:true,geography:place,scope,quote,locator:`${label}, ${observation.year}`};
    const check=verifyFact(fact,text);
    if(!check.ok)return null;
    return {role,fact,document:{ok:true,url,title:`${publisher.name}: ${label}`,text,checksum:sha(body),retrieved_at:new Date().toISOString()},
      trust:{host:publisher.host,class:"intergovernmental",score:96,usable:true,corroborate:false,reason:`Official dataset published by ${publisher.name} through its open API`,publisher:publisher.name,source:"connector"}};
  }

  // Returns verified facts for a question at a ladder level, or [] when no connector applies.
  async function answer(question,level){
    const spec=SPECS[question.indicator_id];if(!spec)return [];
    const code3=question.place.country_code;if(!/^[A-Z]{3}$/.test(code3||""))return [];
    const sector=sectionOf(question.isic);
    const publisher=PUBLISHERS[spec.source],place=question.place.country;
    const wantsSector=level.id==="sector_country";
    if(question.kind==="indicator"&&!["sector_country","country"].includes(level.id))return [];
    if(question.kind==="benchmark"&&!["country","international"].includes(level.id))return [];
    if(question.kind==="indicator"&&wantsSector&&!(sector&&(spec.sector||spec.sectorLevel)))return [];
    if(question.kind==="indicator"&&level.id==="country"&&spec.sectorLevel)return [];
    const data=await series(spec,code3,question,sector);if(!data)return [];

    if(spec.source==="ilo"){
      if(question.kind==="indicator"){
        const observation=wantsSector?data.sector:data.total;
        const rendered=observation&&render({spec,publisher,label:wantsSector?`${spec.label}, sector ${sector}`:spec.label,place:wantsSector?`${place} (sector ${sector})`:place,observation,url:data.url,body:data.body,scope:wantsSector?"sector":"country",question,role:"indicator"});
        return rendered?[rendered]:[];
      }
      if(spec.benchmark==="country_total"&&level.id==="country"&&data.total){
        const rendered=render({spec,publisher,label:`${spec.label}, all economic activities`,place:`${place} (all sectors)`,observation:data.total,url:data.url,body:data.body,scope:"country",question,role:"benchmark"});
        return rendered?[rendered]:[];
      }
      return [];
    }

    const main=data.main,world=data.world;
    const label=main?.indicator||spec.label;
    if(question.kind==="indicator"){
      const observation=main?.total;
      const rendered=observation&&render({spec,publisher,label,place:main.country||place,observation,url:main.url,body:main.body,scope:wantsSector?"sector":"country",question,role:"indicator"});
      return rendered?[rendered]:[];
    }
    if(level.id==="international"&&world?.total&&(spec.benchmark==="world"||spec.benchmark==="who_global")){
      const rendered=render({spec,publisher,label:`${label}, world`,place:"World",observation:world.total,url:world.url,body:world.body,scope:"global",question,role:"benchmark"});
      return rendered?[rendered]:[];
    }
    return [];
  }

  return {answer,has:indicatorId=>Boolean(SPECS[indicatorId])};
}

module.exports={PUBLISHERS,SPECS,createConnectors,parseCsv,pickObservation,sectionOf};
