# SYCLE

SYCLE is an AI-assisted Social Life Cycle Assessment platform that turns a product or facility description into a structured, evidence-backed screening report. It builds a product-specific life cycle, plans the evidence required for each stage and stakeholder, retrieves reusable and external evidence, records data quality and gaps, and renders an auditable report with calculations, citations, recommendations, comparisons, and export tools.

## Architecture

- `sycle-platform.html`: source for the browser application and report renderer.
- `public/index.html`: generated static application served by Vercel.
- `api/`: Vercel API routes for authentication, reports, research jobs, and warehouse maintenance.
- `evidence_engine/`: product resolution, source discovery, assessment methodology, scoring, validation, and evidence warehousing.
- `supabase/migrations/`: private report storage, evidence-library, lifecycle-job, and review schemas.
- `scripts/`: local development and static build scripts.

## Global evidence discovery

For any product in any country, `evidence_engine/discovery/` finds its own sources instead of using fixed per-country lists:

1. Each stage x stakeholder topic becomes a precise question (indicator, place, year, benchmark), with a twin question for its benchmark.
2. For each question it checks the saved fact library first (`sycle_discovered_facts`), then searches the web and reads pages and PDFs.
3. Publishers are trust-scored by rule (government, intergovernmental, standards, academic, ...), with a model judgement for unknown publishers that is capped and queued for review. A starter list of global sources (ILOSTAT, World Bank, OECD, WHO, ...) is the safety net.
4. Facts are accepted only when ordinary code confirms the quote is on the fetched page and the number is in the quote.
5. A fallback ladder (exact, sector in country, country, international) means a proxy is labelled and graded rather than leaving the report blank. Conflicting sources are both kept and sent to `sycle_review_queue`.
6. Every verified fact, and every failed search, is saved so the next report reuses it. `robots.txt` is obeyed.

It needs **no paid keys**. Built in:

- `discovery/connectors.js`: open-data connectors for the ILO (ILOSTAT), World Bank, WHO and the UN SDG database. One code path covers almost every country, returns exact published values, and supplies benchmarks (for example sector vs all-sector injury rates, or the world average).
- `discovery/open-search.js`: keyless document search over OpenAlex and the World Bank documents API.
- `discovery/extract-local.js`: rule-based fact extraction for documents (precision over recall; never above medium confidence).

Optional upgrades, server-side only, that add reach but are not required: a web search key (`BRAVE_API_KEY`, `TAVILY_API_KEY` or `SERPER_API_KEY`) and a model key (`ANTHROPIC_API_KEY`, optional `SYCLE_LLM_MODEL`) for reading arbitrary web pages and translating queries.

Apply migration `008_discovered_facts.sql` so facts persist between users; without a database they are kept for the life of the process only. Per-report spend is capped by `discoveryOptions` (`maxSearches`, `maxFetches`, `maxMs`).

## Local development

```powershell
npm install
npm test
npm run build
npm run dev
```

The development server runs at `http://localhost:3001` unless `PORT` is set.

## Environment

Configure these in the deployment environment; never commit their values:

- `SYCLE_SUPABASE_URL`
- `SYCLE_SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `EVIDENCE_ENGINE_ENABLED=true`
- `EVIDENCE_ENGINE_QUESTION_THRESHOLD` (optional)

Equivalent `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_SECRET_KEY` names are also accepted by the backend.

## Verification

```powershell
npm test
npm run build
```

## Deployment

The repository includes `vercel.json` for Vercel and versioned SQL migrations for Supabase. Apply migrations in numeric order, configure the environment variables, and deploy the repository root.

## Methodology note

SYCLE produces screening-level S-LCA assessments. Version 5 keeps stage-topic results separate, records missing evidence as gaps rather than low risk, grades evidence quality, preserves formulas and assumptions, and requires human review before publication.
