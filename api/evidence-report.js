"use strict";

const { generate } = require("../evidence_engine/production");

module.exports = async function handler(request,response){
  response.setHeader("Cache-Control","no-store");
  if(request.method!=="POST")return response.status(405).json({status:"error",message:"POST required"});
  try{
    const body=typeof request.body==="string"?JSON.parse(request.body):request.body||{};const spec=body.spec||{};const required=["product","sectorKey","sectorLabel","country"];
    const missing=required.filter(field=>!spec[field]);if(missing.length)return response.status(400).json({status:"error",message:`Missing fields: ${missing.join(", ")}`});
    const result=await generate(body);return response.status(result.status==="blocked"?422:200).json(result);
  }catch(error){return response.status(500).json({status:"error",message:"Evidence retrieval failed. No report was generated.",detail:error.message});}
};
