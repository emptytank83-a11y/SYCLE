"use strict";

const {createEvidenceJob,getEvidenceJob,publicJob,runEvidenceJob}=require("../evidence_engine/jobs");
const {userFromToken}=require("../evidence_engine/auth");

module.exports=async function handler(request,response){
  response.setHeader("Cache-Control","no-store");
  try{
    if(request.method==="GET"){
      const loaded=await getEvidenceJob(request.query?.id,request.query?.token);if(!loaded)return response.status(404).json({status:"not_found",message:"Evidence job not found"});
      return response.status(200).json(publicJob(loaded.job));
    }
    if(request.method!=="POST")return response.status(405).json({status:"error",message:"GET or POST required"});
    const token=String(request.headers.authorization||"").replace(/^Bearer\s+/i,""),user=await userFromToken(token);if(!user)return response.status(401).json({status:"unauthorized",message:"Sign in required"});
    const body=typeof request.body==="string"?JSON.parse(request.body):request.body||{};
    if(body.action==="run"){
      const result=await runEvidenceJob(body.job_id,body.access_token);return response.status(result.status==="not_found"?404:200).json(result);
    }
    const payload=body.payload||body;if(!payload?.spec?.prompt)return response.status(400).json({status:"error",message:"A project prompt is required"});
    const job=await createEvidenceJob(payload,{userId:user.id});return response.status(202).json(job);
  }catch(error){return response.status(500).json({status:"error",message:"SYCLE could not start this evidence job. Please retry."});}
};

module.exports.config={maxDuration:300};
