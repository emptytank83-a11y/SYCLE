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
