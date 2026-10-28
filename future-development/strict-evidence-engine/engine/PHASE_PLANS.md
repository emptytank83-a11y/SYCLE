# Phase plans

## Phase 0 - Map the codebase

Create `ARCHITECTURE_NOTES.md` documenting parsing, generation, scoring,
persistence, chat, PDF export, stack, and additive extension points. No existing
file is touched.

## Phase 1 - Skeleton and feature flag

Create the requested module directories, a disabled-by-default environment
flag, a public engine entry point, and legacy snapshot tests. No existing file
is touched; the tests load the legacy inline script through an isolated VM.

## Phase 2 - Evidence data model and storage

Add runtime-validated record schemas, a typed repository service, an immutable
in-memory implementation, and a new evidence-only SQL migration. Existing
tables and application files remain untouched.

## Phase 3 - Geography resolver

Create ISO/Census file importers and a repository-backed resolver that returns
candidate chains instead of guessing. Add recorded offline fixtures for New
York ambiguity, Albany county resolution, and Texas.

## Phase 4 - Jurisdiction rules

Generate null-only state rule seeds from ingested US subdivision records,
implement verified-only hierarchical lookup, and add an unverified-rule CLI.
No legal value is populated without human verification.

## Phase 5 - Indicator catalogue and ingestion framework

Add a complete stakeholder-category catalogue, source registry, product map,
connector framework, official API/file connector plans, ingestion CLI, and
licensed-database/MRIO adapter interfaces. Tests use recorded payloads only.

## Phase 6 - Clarifying questions

Add a pure ReportSpec question service that evaluates plausible answers through
an injected scoring function, always asks ambiguous geography, and records
unanswered defaults as assumptions. No API hook exists in the static app.

## Phase 7 - Evidence assembler

Create a catalogue-driven assembler that selects the most specific ranked
evidence, downgrades fallback confidence, emits gaps, resolves verified rules,
and derives sourcing only from trade and mineral-share evidence.

## Phase 8 - Deterministic scoring

Add configured indicator normalisation, weighted roll-ups with complete traces,
confidence/weight sensitivity bounds, and an explicit activity-weighting status.
All methodology choices remain pending expert review.

## Phase 9 - Constrained narrator and validator

Add an injected structured narrator with evidence/number/geography enforcement,
plus a read-only validator for legacy and v2 reports and a saved-report CLI.
Record the absence of a production LLM client as an integration blocker.

## Phase 10 - Pipeline, comparison, regression, and adapter

Compose the full evidence pipeline, comparison output, golden drift harness,
methodology export, and opt-in legacy-schema adapter. Verify the existing PDF
renderer accepts an adapted report without changing UI code.
