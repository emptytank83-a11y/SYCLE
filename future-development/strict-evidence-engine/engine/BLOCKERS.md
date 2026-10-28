# Blockers

## Phase 9 - production narrator client

The current static SYCLE application has no LLM client or backend API. The
constrained narrator therefore accepts an injected `llmClient` and is fully
tested with a mock, but no production model call can be registered without an
existing guarded backend extension point or a new API architecture. The engine
still supports a deterministic evidence-only narrative fallback.

## Phase 10 - static application registration

The legacy app is one inline browser script with no module loader and no
build-time environment injection. Registering the CommonJS evidence engine in
that file would require a new browser bundle and an existing-file script hook.
To obey the additive/no-UI rule, Phase 10 provides the adapter and verifies it
against the legacy renderer in isolation, but does not register it in the live
static UI. A backend or approved browser-bundle hook is required to enable it.

## Global discovery (added)

Discovery runs with no paid keys (open-data connectors, open document indexes, rule-based extraction). Optional search
and model keys only extend reach. Still required from a person: applying migration 008, and review of
`sycle_review_queue` and of hosts in `sycle_source_registry` with `review_status = 'pending_review'`.
Known limits: connectors give national (and broad-sector) figures, not site-level data; the open web beyond the
built-in indexes needs a search key; the latest ILO/WHO year can be several years old and is graded accordingly.
Scoring thresholds in `discovery/score.js` are a methodology choice and remain pending expert review.
