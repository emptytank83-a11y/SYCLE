"use strict";

// Reference-scale scoring for discovered indicators: the value is compared with a benchmark that was itself
// found and verified. Thresholds are a methodology choice and stay "pending expert review" with the rest of scoring.

const THRESHOLDS=Object.freeze([[.5,2],[.9,1],[1.1,0],[2,-1],[Infinity,-2]]);
const unitKey=unit=>String(unit||"").toLowerCase().replace(/[^a-z0-9%]+/g,"");

// "badness ratio": below 1 means better than the benchmark, whichever way the indicator points.
function badnessRatio(value,benchmark,direction){
  if(!Number.isFinite(value)||!Number.isFinite(benchmark))return null;
  if(direction==="lower_is_better"){if(benchmark<=0)return value<=0?1:Infinity;return value/benchmark;}
  if(direction==="higher_is_better"){if(value<=0)return benchmark<=0?1:Infinity;return benchmark/value;}
  return null;
}

function referenceScore({value,benchmark,direction,unit,benchmarkUnit}){
  if(!direction)return {score:null,reason:"Indicator has no defined direction of better or worse"};
  if(unitKey(unit)!==unitKey(benchmarkUnit))return {score:null,reason:`Units differ (${unit} vs ${benchmarkUnit}); not compared`};
  const ratio=badnessRatio(Number(value),Number(benchmark),direction);
  if(ratio===null)return {score:null,reason:"Value or benchmark is not numeric"};
  const score=THRESHOLDS.find(([limit])=>ratio<=limit)[1];
  return {score,ratio,formula:direction==="lower_is_better"?"value / benchmark":"benchmark / value",thresholds:"<=0.5:+2, <=0.9:+1, <=1.1:0, <=2:-1, else -2"};
}

// Grade is capped by how far down the fallback ladder the evidence came from.
function gradeFor({level,trust,year,nowYear=new Date().getFullYear()}){
  const age=year?Math.max(0,nowYear-year):null,order="ABCD";
  let grade=trust>=95&&(age===null||age<=3)?"A":trust>=85&&(age===null||age<=5)?"B":trust>=60&&(age===null||age<=8)?"C":"D";
  if(order.indexOf(grade)<order.indexOf(level.quality_cap))grade=level.quality_cap;
  return grade;
}

module.exports={badnessRatio,gradeFor,referenceScore,unitKey};
