# SYCLE

SYCLE is an AI-assisted Social Life Cycle Assessment platform that turns a product or facility description into a structured, evidence-backed screening report. It builds a product-specific life cycle, plans the evidence required for each stage and stakeholder, retrieves reusable and external evidence, records data quality and gaps, and renders an auditable report with calculations, citations, recommendations, comparisons, and export tools.

## Architecture

- `sycle-platform.html`: source for the browser application and report renderer.
- `public/index.html`: generated static application served by Vercel.
- `api/`: Vercel API routes for authentication, reports, research jobs, and warehouse maintenance.
- `evidence_engine/`: product resolution, source discovery, assessment methodology, scoring, validation, and evidence warehousing.
- `supabase/migrations/`: private report storage, evidence-library, lifecycle-job, and review schemas.
- `scripts/`: local development and static build scripts.

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
