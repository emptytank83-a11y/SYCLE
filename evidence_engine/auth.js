"use strict";

function config(env=process.env){
  const base=(env.SYCLE_SUPABASE_URL||env.SUPABASE_URL||"").replace(/\/$/,""),key=env.SYCLE_SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY;
  if(!base||!key)throw new Error("Authentication is unavailable");return {base,key};
}

async function authRequest(path,{method="GET",body,token,env=process.env,fetchImpl=fetch}={}){
  const {base,key}=config(env),response=await fetchImpl(`${base}/auth/v1/${path}`,{method,headers:{apikey:key,authorization:`Bearer ${token||key}`,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)}),text=await response.text();let payload={};try{payload=text?JSON.parse(text):{};}catch(error){payload={};}return {ok:response.ok,status:response.status,payload};
}

async function userFromToken(token,options={}){
  if(!token)return null;const result=await authRequest("user",{...options,token});return result.ok?result.payload:null;
}

module.exports={authRequest,config,userFromToken};
