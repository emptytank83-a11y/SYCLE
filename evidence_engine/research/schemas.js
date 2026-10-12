"use strict";

const {z}=require("zod");

const question=z.object({
  id:z.string().min(2),
  text:z.string().min(8),
  options:z.array(z.object({value:z.string().min(1),label:z.string().min(1)})).min(2).max(6),
  reason:z.string().min(8)
});

const source=z.object({
  id:z.string().min(2),
  title:z.string().min(4),
  publisher:z.string().min(2),
  url:z.string().url(),
  dataset_url:z.string().url().nullable(),
  publication_year:z.number().int().min(1900).max(2100).nullable(),
  source_type:z.enum(["official_dataset","official_document","law_or_regulation","academic","industry_standard","industry_publication","open_knowledge"]),
  licence_name:z.string().nullable(),
  licence_url:z.string().url().nullable(),
  complete_dataset_available:z.boolean(),
  authority_reason:z.string().min(8)
});

const claim=z.object({
  id:z.string().min(2),
  statement:z.string().min(12),
  claim_type:z.enum(["product_definition","process","material","sourcing","social_risk","regulation","methodology"]),
  source_ids:z.array(z.string()).min(1),
  evidence_quote:z.string().min(6).max(240),
  locator:z.string().min(2),
  geography:z.string().nullable(),
  publication_year:z.number().int().min(1900).max(2100).nullable(),
  confidence:z.enum(["H","M","L"]),
  stakeholder:z.enum(["workers","local_communities","society","value_chain_actors","children","consumers"]).nullable(),
  risk_level:z.enum(["low","moderate","high","critical"]).nullable()
});

const stage=z.object({
  id:z.string().min(2),
  title:z.string().min(3),
  description:z.string().min(20),
  inputs:z.array(z.string().min(2)).min(1),
  outputs:z.array(z.string().min(2)).min(1),
  actor:z.string().min(3),
  foreground:z.boolean(),
  likely_countries:z.array(z.string()).default([]),
  social_risks:z.array(z.string().min(3)).min(1),
  logistics:z.string().min(8),
  claim_ids:z.array(z.string()).min(1)
});

const researchPlanSchema=z.object({
  intake:z.object({
    product:z.string().min(2),
    industry:z.string().min(2),
    facility_activity:z.string().min(2),
    technology:z.string().nullable(),
    country:z.string().min(2),
    country_code:z.string().regex(/^[A-Z]{3}$/),
    region:z.string().nullable(),
    locality:z.string().nullable(),
    scale_value:z.number().positive().nullable(),
    scale_unit:z.string().nullable(),
    timeframe:z.string().nullable(),
    boundary:z.string().min(3),
    classifications:z.object({isic:z.array(z.string()),naics:z.array(z.string()),hs:z.array(z.string())})
  }),
  clarification_questions:z.array(question).max(5),
  product_identity:z.object({requested_product:z.string(),resolved_product:z.string(),wikidata_id:z.string().nullable(),description:z.string().nullable(),aliases:z.array(z.string()),classifications:z.record(z.string(),z.array(z.string())),confidence:z.enum(["H","M","L"]),evidence:z.array(z.record(z.string(),z.unknown()))}).optional(),
  lifecycle:z.object({summary:z.string().min(20),stages:z.array(stage).min(3).max(18)}),
  evidence_requirements:z.array(z.object({
    id:z.string(),
    stage_ids:z.array(z.string()).min(1),
    topic:z.string().min(3),
    geography_level:z.enum(["facility","locality","region","country","supply_chain_country","global"]),
    preferred_source_types:z.array(z.string()).min(1),
    search_query:z.string().min(8)
  })).min(3),
  sources:z.array(source).min(1).max(20),
  claims:z.array(claim).min(3).max(60),
  measurements:z.array(z.object({
    id:z.string().min(2),
    indicator_id:z.string().min(3),
    indicator_name:z.string().min(3),
    value:z.number().nullable(),
    value_text:z.string().nullable(),
    unit:z.string().min(1),
    geography:z.string().min(2),
    geography_level:z.enum(["facility","locality","region","country","supply_chain_country","global"]),
    year:z.number().int().min(1900).max(2100).nullable(),
    source_id:z.string().min(2),
    evidence_quote:z.string().min(6).max(240),
    locator:z.string().min(2),
    interpretation:z.string().min(8),
    confidence:z.enum(["H","M","L"])
  })).default([]),
  recommendations:z.array(z.object({
    title:z.string().min(3),
    action:z.string().min(12),
    rationale:z.string().min(12),
    priority:z.enum(["immediate","near_term","monitor"]),
    claim_ids:z.array(z.string()).min(1)
  })).min(3).max(10)
});

module.exports={researchPlanSchema};
