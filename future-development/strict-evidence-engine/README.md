# Strict evidence engine (inactive archive)

This folder preserves the evidence-led assessment system that was live on
2026-10-28. It is intentionally not called by the production report workflow.

The archive contains:

- `engine/`: research, discovery, warehouse, assessment, validation and tests.
- `api/`: evidence-job and warehouse-maintenance endpoints.
- `frontend/index.strict.html`: the strict report-generation UI snapshot.
- `supabase/`: the evidence warehouse and assessment migrations.

The production application currently uses the complete screening report
generator retained in `sycle-platform.html`. Reintroduce this engine only after
its retrieval coverage can satisfy its evidence contract without producing
gap-dominated reports.

Do not edit this archive when changing the production application. Develop a
new version on a branch or copy it into an active module first.
