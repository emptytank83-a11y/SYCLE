"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const evidenceHandler = require("../api/evidence-report");

const port = Number(process.env.PORT || process.argv[2] || 3001);
const index = path.join(__dirname,"..","public","index.html");

http.createServer(async (request,response) => {
  if (request.url === "/api/evidence-report") {
    const chunks=[];for await (const chunk of request)chunks.push(chunk);
    request.body=chunks.length?Buffer.concat(chunks).toString("utf8"):"";
    response.status=(code)=>{response.statusCode=code;return response;};
    response.json=(value)=>{response.setHeader("content-type","application/json");response.end(JSON.stringify(value));};
    return evidenceHandler(request,response);
  }
  if (request.url === "/" || request.url === "/index.html") {
    response.setHeader("content-type","text/html; charset=utf-8");
    return fs.createReadStream(index).pipe(response);
  }
  response.statusCode=404;response.end("Not found");
}).listen(port,"127.0.0.1",()=>console.log(`SYCLE dev server listening on http://127.0.0.1:${port}`));
