# SYCLE architecture notes

## Current application

SYCLE is a static browser application. `sycle-platform.html` contains the HTML,
CSS, knowledge base, report generator, persistence, follow-up logic, and export
logic. `scripts/build-static.js` copies that file to `public/index.html` for
Vercel. There is no bundled JavaScript module graph and no server API.

### Prompt parsing

`validateReportPrompt` checks that a prompt contains a subject, geography, and
scale or timeline. `findCountry`, `findRegion`, `findSector`, `parseQuantity`,
and `extractProduct` parse those values using inline regular expressions and
lookup objects. `pendingReportDraft` concatenates clarification answers before
calling `buildReport`.

### Templates and risk tables

Country risk bands and narrative notes are in the inline `COUNTRIES` object.
State and locality aliases are in `REGION`. Sector process, sourcing, hotspot,
worker, consumer, and SDG templates are in `SECTORS`. Product-specific supply
chain rows are in `SUPPLY_CHAIN_KB`, with `generic` as the fallback.

### Scoring

`computeScores` combines country bands and sector heuristics into six pillar
scores. It calculates the headline score from fixed pillar weights. The inputs,
normalisation, and intermediate calculations are not persisted as a trace.

### Report object and persistence

`buildReport` creates the report object. It stores parsed inputs, legacy scores,
statistics, generated supply chain data, a presentation style, and a nested
`model` from `structuredModel`. Reports are stored as a JSON array in a
per-email localStorage namespace. A Supabase migration defines `sycle_reports`
with `report_data jsonb`, but the static application does not currently use it.

### Follow-up chat

The active report is held in `currentReport`. `reportAnswerHTML` and
`handleReportFollowup` inspect the saved legacy report object and answer through
regular-expression branches. Some branches create a new scenario or rebuild a
report with `buildReport`; there is no external LLM client.

### PDF export

`exportPDF` opens a print-only browser window containing `reportHTML(R)` and
invokes `window.print()`. The user selects Save as PDF. There is no server-side
PDF renderer.

### Stack, database, tests, and configuration

- Runtime: browser-native HTML/CSS/JavaScript.
- Build: Node script copying one HTML file to `public/index.html`.
- Hosting: Vercel static output.
- Persistence in use: localStorage.
- Database schema present: Supabase PostgreSQL migration with row-level security.
- Tests: none in the legacy repository.
- Configuration: no environment loader or browser build-time env injection.

## Safest additive extension points

1. Keep the new engine as a standalone CommonJS module tree under
   `evidence_engine` and test it with `node --test`.
2. Expose one pipeline function that accepts a parsed `ReportSpec` and returns
   only the optional `evidence_v2` payload.
3. Add database objects only through a new migration inside
   `evidence_engine/migrations` until a guarded deployment hook is approved.
4. A future browser hook can load a generated engine bundle only when
   `EVIDENCE_ENGINE_ENABLED` is explicitly true. No such hook is required for
   shadow-mode development.
5. A future API hook can expose question and pipeline functions after SYCLE has
   a backend API. The present app has no route-registration layer.
6. The Phase 10 adapter can map v2 results to a copy of the legacy schema, but
   calling the inline `reportHTML` function from Node would require extracting
   or editing legacy code. That conflict must be recorded if it remains at
   Phase 10.

## Compatibility baseline

With no existing-file changes and `EVIDENCE_ENGINE_ENABLED` defaulting to
false, the legacy browser behavior and generated output remain identical.
