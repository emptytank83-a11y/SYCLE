"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadLegacyRuntime() {
  const appPath = path.resolve(__dirname, "..", "..", "sycle-platform.html");
  const html = fs.readFileSync(appPath, "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (!scripts.length) throw new Error("Legacy application script not found");
  const sandbox = {
    console, Date, Math, JSON, setTimeout, clearTimeout,
    document: { readyState: "loading", addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(scripts.at(-1)[1], sandbox, { filename: "sycle-platform.html" });
  return { buildReport: sandbox.buildReport, reportHTML: sandbox.reportHTML };
}

module.exports = { loadLegacyRuntime };
