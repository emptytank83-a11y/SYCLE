const fs = require("fs");
const path = require("path");

const root = process.cwd();
const source = path.join(root, "sycle-platform.html");
const outDir = path.join(root, "public");
const target = path.join(outDir, "index.html");

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(source, target);
console.log("Built SYCLE static app to public/index.html");
