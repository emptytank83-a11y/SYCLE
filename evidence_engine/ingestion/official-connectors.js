"use strict";

const { CanonicalFileConnector, JsonApiConnector } = require(".");

const DEFINITIONS = Object.freeze({
  bls_soii:{name:"BLS Survey of Occupational Injuries and Illnesses",publisher:"US Bureau of Labor Statistics",url:"https://www.bls.gov/iif/nonfatal-injuries-and-illnesses-tables.htm",mode:"file"},
  bls_cps_union:{name:"BLS Union Members",publisher:"US Bureau of Labor Statistics",url:"https://www.bls.gov/news.release/union2.toc.htm",mode:"file"},
  census_acs:{name:"American Community Survey",publisher:"US Census Bureau",url:"https://api.census.gov/data.html",mode:"file"},
  mit_living_wage:{name:"Living Wage Calculator",publisher:"MIT",url:"https://livingwage.mit.edu/pages/methodology",mode:"file"},
  osha_enforcement:{name:"OSHA Enforcement Data",publisher:"US Occupational Safety and Health Administration",url:"https://www.osha.gov/data",mode:"file"},
  ituc_gri:{name:"ITUC Global Rights Index",publisher:"International Trade Union Confederation",url:"https://www.globalrightsindex.org/",mode:"file"},
  transparency_cpi:{name:"Corruption Perceptions Index",publisher:"Transparency International",url:"https://www.transparency.org/en/cpi",mode:"file"},
  world_bank_wgi:{name:"Worldwide Governance Indicators",publisher:"World Bank",url:"https://api.worldbank.org/v2/country/all/indicator/VA.EST?format=json",mode:"api"},
  walk_free_gsi:{name:"Global Slavery Index",publisher:"Walk Free",url:"https://www.walkfree.org/global-slavery-index/",mode:"file"},
  fund_for_peace_fsi:{name:"Fragile States Index",publisher:"Fund for Peace",url:"https://fragilestatesindex.org/",mode:"file"},
  us_dol_goods:{name:"List of Goods Produced by Child Labor or Forced Labor",publisher:"US Department of Labor",url:"https://www.dol.gov/agencies/ilab/reports/child-labor/list-of-goods",mode:"file"},
  usitc_dataweb:{name:"USITC DataWeb",publisher:"US International Trade Commission",url:"https://dataweb.usitc.gov/",mode:"file"},
  un_comtrade:{name:"UN Comtrade",publisher:"United Nations Statistics Division",url:"https://comtradeapi.un.org/",mode:"file"},
  usgs_mcs:{name:"Mineral Commodity Summaries",publisher:"US Geological Survey",url:"https://www.usgs.gov/centers/national-minerals-information-center/mineral-commodity-summaries",mode:"file"}
});

function sourceRecord(id) {
  const definition = DEFINITIONS[id];
  if (!definition) throw new Error(`Unknown connector: ${id}`);
  return { id, name: definition.name, publisher: definition.publisher, url: definition.url,
    licence: null, licence_commercial_ok: null, update_cadence: null };
}

function createConnector(id, options = {}) {
  const definition = DEFINITIONS[id];
  const common = { id, source: sourceRecord(id), edition: options.edition || "unspecified", retries: options.retries, fetchImpl: options.fetchImpl };
  if (definition.mode === "api") {
    return new JsonApiConnector({ ...common, url: options.url || definition.url, mapRows: options.mapRows || (() => []) });
  }
  if (!options.file) throw new Error(`${id} requires a manually downloaded canonical file`);
  return new CanonicalFileConnector({ ...common, file: options.file });
}

module.exports = { DEFINITIONS, createConnector, sourceRecord };
