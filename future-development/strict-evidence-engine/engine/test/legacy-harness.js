"use strict";

const { loadLegacyRuntime } = require("../comparison/legacy-runtime");

function loadLegacyGenerator() {
  return loadLegacyRuntime().buildReport;
}

module.exports = { loadLegacyGenerator, loadLegacyRuntime };
