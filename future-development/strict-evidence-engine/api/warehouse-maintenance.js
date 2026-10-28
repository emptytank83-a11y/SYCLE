"use strict";

const crypto=require("node:crypto");
const {createWarehouseClient}=require("../evidence_engine/warehouse/client");
const {processNextIngestionJob}=require("../evidence_engine/warehouse/dataset-ingestion");

function timingSafeEqual(left,right){const a=Buffer.from(String(left||"")),b=Buffer.from(String(right||""));return a.length===b.length&&crypto.timingSafeEqual(a,b);}

module.exports=async function handler(request,response){
  const token=String(request.headers?.authorization||"").replace(/^Bearer\s+/i,"");
  if(!process.env.CRON_SECRET||!timingSafeEqual(token,process.env.CRON_SECRET))return response.status(401).json({status:"unauthorized"});
  try{const client=createWarehouseClient();if(!client)throw new Error("Warehouse credentials unavailable");const result=await processNextIngestionJob(client);return response.status(200).json(result);}
  catch(error){return response.status(500).json({status:"error",message:error.message});}
};

module.exports.config={maxDuration:300};
