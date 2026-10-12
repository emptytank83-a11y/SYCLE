"use strict";

const {userFromToken}=require("../evidence_engine/auth");
const {createWarehouseClient}=require("../evidence_engine/warehouse/client");

module.exports=async function handler(request,response){
  response.setHeader("Cache-Control","no-store");
  try{
    const token=String(request.headers.authorization||"").replace(/^Bearer\s+/i,""),user=await userFromToken(token);if(!user)return response.status(401).json({status:"unauthorized",message:"Sign in required"});
    const client=createWarehouseClient();if(!client)throw new Error("Warehouse unavailable");
    if(request.method==="GET"){
      const rows=await client.request(`sycle_user_reports?select=report_id,report_json,updated_at&user_id=eq.${user.id}&order=updated_at.desc&limit=200`);return response.status(200).json({status:"complete",reports:(rows||[]).map(item=>item.report_json)});
    }
    if(request.method!=="PUT")return response.status(405).json({status:"error",message:"GET or PUT required"});
    const body=typeof request.body==="string"?JSON.parse(request.body):request.body||{},reports=Array.isArray(body.reports)?body.reports.slice(0,200):[];if(reports.some(item=>!item?.id))return response.status(400).json({status:"error",message:"Every report requires an id"});
    const existing=await client.request(`sycle_user_reports?select=report_id&user_id=eq.${user.id}`),incoming=new Set(reports.map(item=>String(item.id))),removed=(existing||[]).map(item=>item.report_id).filter(id=>!incoming.has(id));
    if(reports.length)await client.request("sycle_user_reports?on_conflict=user_id,report_id",{method:"POST",body:reports.map(report=>({user_id:user.id,report_id:String(report.id),report_json:report,updated_at:new Date().toISOString()})),prefer:"resolution=merge-duplicates,return=minimal"});
    if(removed.length)await client.request(`sycle_user_reports?user_id=eq.${user.id}&report_id=in.(${removed.map(encodeURIComponent).join(",")})`,{method:"DELETE",prefer:"return=minimal"});
    return response.status(200).json({status:"complete",saved:reports.length,deleted:removed.length});
  }catch(error){return response.status(500).json({status:"error",message:"SYCLE could not synchronize reports right now."});}
};

module.exports.config={maxDuration:60};
