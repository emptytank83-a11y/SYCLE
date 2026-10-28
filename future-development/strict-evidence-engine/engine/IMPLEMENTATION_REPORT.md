# Evidence engine implementation report

Date: 2026-10-07

## Outcome

A parallel, disabled-by-default evidence engine now exists entirely under
`evidence_engine`. It resolves geography without silent guesses, stores
immutable source versions and evidence records, assembles the most specific
available evidence, computes deterministic traceable scores, constrains
narrative claims, validates legacy and v2 reports, and can adapt v2 output to a
copy of the legacy report schema.

The production SYCLE UI still uses the legacy template engine. No production
data has been ingested and the evidence engine has not been registered in the
static browser application.

## Phase commits

- Phase 0, architecture map: `64a952b`
- Phase 1, skeleton and disabled feature flag: `b038452`
- Phase 2, evidence model, repository, and migration: `8af2206`
- Phase 3, ISO/Census geography ingestion and resolver: `72f873d`
- Phase 4, verified-only jurisdiction rules: `0a18e4c`
- Phase 5, UNEP catalogue, product map, and connectors: `e517efa`
- Phase 6, decision-critical question service: `491431d`
- Phase 7, evidence assembler: `d9894eb`
- Phase 8, deterministic scoring and traces: `b1088f4`
- Phase 9, constrained narrator and validator: `ced7621`
- Phase 10, pipeline, comparison, golden harness, methodology, and adapter: `96bac36`

## Existing files touched

None. `sycle-platform.html`, `public/index.html`, `package.json`, `vercel.json`,
`scripts/build-static.js`, and `supabase/migrations/001_sycle_reports.sql` have
no diff from the pre-engine commit. Running the existing build rewrote
`public/index.html` with byte-identical content.

This preserves legacy behavior with the flag off. It also means the engine is
not yet callable from the deployed static app; see Blockers.

## Tests

- Full evidence-engine suite: 27 passed, 0 failed.
- `EVIDENCE_ENGINE_ENABLED=false`: 27 passed, 0 failed.
- `EVIDENCE_ENGINE_ENABLED=true`: 27 passed, 0 failed.
- Existing build: `npm.cmd run build` passed.
- Legacy snapshots cover car/New York, lithium battery/Germany, and coffee/Brazil.
- Existing PDF report renderer successfully rendered an opt-in adapted v2 report.
- CI fixtures are recorded/synthetic and make no live network calls.

## New York car comparison

Prompt: `Car, 4,000 units/year, New York`

```json
{
  "status": "needs_clarification",
  "legacy_scores": {
    "worker": 59,
    "humanRights": 15,
    "community": 50,
    "supplyChain": 35,
    "governance": 65,
    "consumer": 58,
    "overall": 43
  },
  "evidence_v2_scores": null,
  "legacy_countries": [
    "China", "Mexico", "Germany", "Japan", "Thailand", "Brazil",
    "DR Congo", "United States"
  ],
  "evidence_v2_countries": [],
  "legacy_hotspots": {
    "template": "generic",
    "stages": 4,
    "stage_country_list": [
      "China", "India", "Germany", "United States", "Vietnam",
      "Mexico", "Netherlands"
    ],
    "high_risk_countries": ["China", "India"]
  },
  "evidence_v2_hotspots": [],
  "legacy_validator_findings": [
    {"code": "foreign_geography", "geography": "Texas"},
    {"code": "placeholder_reference", "reference": "Government Labour Agencies"},
    {"code": "placeholder_reference", "reference": "Industry Publications"}
  ],
  "evidence_v2_validator_findings": [],
  "evidence_backed_sentences_percent": 0,
  "state_or_better_indicators_percent": 0,
  "questions": [{
    "id": "geography",
    "text": "Which location did you mean?",
    "options": ["US-NY", "US-PLACE-51000"],
    "default_if_unanswered": null,
    "required": true
  }]
}
```

This is the intended difference: the legacy engine silently interprets New
York and produces a score from templates; v2 refuses to score until the user
chooses New York State or New York City. No v2 score is emitted without data.

## Validator summary

The reproducible legacy comparison report failed validation with three
findings: one leaked geography (`Texas`) and two placeholder references.

The user's browser-local saved reports could not be audited from the repository.
They exist in browser localStorage, and browser safety policy prohibits reading
that store. Exported reports can be audited with:

```text
node evidence_engine/cli/index.js validate sycle-reports.json
```

Consequently, an all-saved-report pass rate is not claimed here.

## Human review queue

### Geography source files

- Download the current ISO 3166-1 and ISO 3166-2 machine-readable files from
  the ISO-authorized distribution used by the organisation and record its
  licence before production ingestion.
- Download current US Census state/county FIPS files and a Census place-to-
  county relationship file. Run `node evidence_engine/geography/import-geographies.js`
  with those files; retain checksums and download dates.

### US jurisdiction rules

- Review all seven rule keys for every US state and the District of Columbia:
  right-to-work, OSHA plan coverage, workers' compensation mandate and opt-out,
  minimum wage, pay transparency, and paid sick leave.
- Replace each null only after checking the linked authoritative page, record
  effective date, reviewer, and review timestamp. Until then the engine returns
  a gap and the narrator cannot state the rule.

### Source licensing and downloads

Commercial-use licensing must be reviewed for every connector before production
use. Current status is deliberately `null`: BLS SOII, BLS CPS, Census ACS, MIT
Living Wage, OSHA enforcement/establishment data, ITUC Global Rights Index,
Transparency International CPI, World Bank WGI, Walk Free GSI, Fund for Peace
FSI, US DOL List of Goods, UN Comtrade/USITC DataWeb, and USGS Mineral Commodity
Summaries.

Manual downloads are required for sources without a stable supported API. Save
the original file, download URL, edition, download timestamp, and checksum, then
convert it to the canonical connector input documented in `ingestion/README.md`.

The UNEP source ranking and passenger-car ICE/EV product mappings are draft
expert judgements. A qualified S-LCA practitioner and trade-classification
specialist must approve them before production use.

### Scoring methodology

- Approve every normalisation bound, indicator weight, subcategory mapping, and
  pillar weight in `scoring/config.json`. They are methodology judgements, not
  observed data, and remain `expert_review: pending`.
- Define confidence ranges and sensitivity policy with an S-LCA method owner.
- License and implement an activity-weighting adapter before describing supply-
  chain hotspot scores as worker-hour weighted.

### Narrator integration

- Select and security-review a structured-output LLM client in a backend
  service. The browser must never receive provider secrets.
- Approve narrator prompts and validation rejection handling before enabling
  prose generation in production.

## Blockers

### Production narrator client

The current static SYCLE application has no LLM client or backend API. The
constrained narrator accepts an injected `llmClient` and is tested with a mock,
but no production model call can be registered without a guarded backend
extension point. A deterministic evidence-only fallback is available.

### Static application registration

The legacy app is one inline browser script with no module loader and no
build-time environment injection. Registering this CommonJS engine requires a
browser bundle plus an existing-file script hook. To obey the additive/no-UI
rule, the adapter is implemented and renderer-tested but not live in the app.

## Known limitations

- No production datasets have been ingested; test values are explicitly
  synthetic fixtures and must never be presented as facts.
- Source licences, update cadences, state rules, catalogue rankings, product
  mappings, normalisation bounds, and weights still require human approval.
- The migration exists but has not been applied to Supabase.
- No live LLM narrator or backend API is connected.
- The product map currently contains only a draft passenger-car ICE/EV entry.
- Trade/mineral sourcing remains empty until official data is ingested.
- Activity weighting remains `unweighted` without a licensed PSILCA/SHDB or
  implemented EXIOBASE adapter.
- The live UI, follow-up chat, persistence, and deployed PDF path still use the
  legacy report engine until the guarded integration blocker is resolved.
- Existing browser-local reports require JSON export before batch validation.
