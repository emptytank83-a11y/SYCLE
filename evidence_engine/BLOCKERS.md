# Blockers

## Phase 9 - production narrator client

The current static SYCLE application has no LLM client or backend API. The
constrained narrator therefore accepts an injected `llmClient` and is fully
tested with a mock, but no production model call can be registered without an
existing guarded backend extension point or a new API architecture. The engine
still supports a deterministic evidence-only narrative fallback.
