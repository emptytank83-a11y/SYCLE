"use strict";

const {authRequest}=require("../evidence_engine/auth");

module.exports=async function handler(request,response){
  response.setHeader("Cache-Control","no-store");if(request.method!=="POST")return response.status(405).json({status:"error",message:"POST required"});
  try{
    const body=typeof request.body==="string"?JSON.parse(request.body):request.body||{},action=body.action||"login";
    if(action==="logout"){const token=String(request.headers.authorization||"").replace(/^Bearer\s+/i,"");if(token)await authRequest("logout",{method:"POST",token});return response.status(200).json({status:"signed_out"});}
    if(action==="refresh"){const result=await authRequest("token?grant_type=refresh_token",{method:"POST",body:{refresh_token:body.refresh_token}});return response.status(result.ok?200:401).json(result.ok?{status:"authenticated",session:result.payload}:{status:"error",message:"Your session expired. Please sign in again."});}
    const email=String(body.email||"").trim().toLowerCase(),password=String(body.password||"");if(!email.includes("@")||password.length<6)return response.status(400).json({status:"error",message:"Enter a valid email and a password of at least 6 characters."});
    let result=await authRequest("token?grant_type=password",{method:"POST",body:{email,password}});
    if(!result.ok){
      result=await authRequest("signup",{method:"POST",body:{email,password}});
      if(!result.ok&&result.payload?.error_code==="over_email_send_rate_limit"){
        const created=await authRequest("admin/users",{method:"POST",body:{email,password,email_confirm:true,user_metadata:{created_by:"sycle_email_password_signup"}}});
        if(created.ok)result=await authRequest("token?grant_type=password",{method:"POST",body:{email,password}});
      }
      if(result.ok&&!result.payload.access_token){
        const signupUser=result.payload.user||result.payload,identities=Array.isArray(signupUser?.identities)?signupUser.identities:[];
        if(signupUser?.id&&identities.length){
          const confirmed=await authRequest(`admin/users/${signupUser.id}`,{method:"PUT",body:{email_confirm:true,user_metadata:{created_by:"sycle_email_password_signup"}}});
          if(confirmed.ok)result=await authRequest("token?grant_type=password",{method:"POST",body:{email,password}});
        }
      }
      if(result.ok&&!result.payload.access_token)return response.status(200).json({status:"confirmation_required",message:"This email already has an account awaiting confirmation. Use a confirmed account or contact your SYCLE administrator."});
    }
    if(!result.ok||!result.payload.access_token){console.error("auth login/signup failure",{status:result.status,code:result.payload?.error_code||result.payload?.code||null,message:result.payload?.msg||result.payload?.message||result.payload?.error_description||null});return response.status(401).json({status:"error",message:"Sign-in failed. Check your email and password."});}
    return response.status(200).json({status:"authenticated",session:result.payload});
  }catch(error){return response.status(500).json({status:"error",message:"SYCLE authentication is temporarily unavailable."});}
};
