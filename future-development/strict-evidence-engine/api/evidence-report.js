"use strict";

const {generate}=require("../evidence_engine/production");
const {userFromToken}=require("../evidence_engine/auth");

module.exports = async function handler(request,response){
  response.setHeader("Cache-Control","no-store");
  if(request.method!=="POST")return response.status(405).json({status:"error",message:"POST required"});
  try{
    const token=String(request.headers.authorization||"").replace(/^Bearer\s+/i,"");
    const user=await userFromToken(token);
    if(!user)return response.status(401).json({status:"unauthorized",message:"Sign in required"});
    const body=typeof request.body==="string"?JSON.parse(request.body):request.body||{};const spec=body.spec||{};const required=["prompt"];
    const missing=required.filter(field=>!spec[field]);if(missing.length)return response.status(400).json({status:"error",message:`Missing fields: ${missing.join(", ")}`});
    const result=await generate(body,{requireDynamicResearch:false,requireSupabase:true,userId:user.id});return response.status(result.status==="blocked"?422:200).json(result);
  }catch(error){console.error("evidence-report failure",{code:error.code||"unhandled",message:error.message,stack:error.stack});return response.status(500).json({status:"error",message:"SYCLE could not complete this evidence job. Please retry; no unsupported report was saved."});}
};

module.exports.config={maxDuration:300};
